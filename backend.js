const crypto = require('crypto')
const db = require('./db')

const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server, {
    maxHttpBufferSize: 1e8, pingTimeout: 60000})
const multer  = require('multer')
const upload = multer()

app.set('views', './views')
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))

const port = process.env.PORT || 3000

const DEFAULT_ANSWER_TIME = 20 // seconds
const DEFAULT_BUZZ_TIME = 5 // seconds — matches the previous hardcoded client-side window
const DEFAULT_REVEAL_TIME = 3 // seconds — pause after a verdict before moving on

function parseAnswerTime(value) {
  const seconds = parseInt(value, 10)
  if (!Number.isFinite(seconds)) return DEFAULT_ANSWER_TIME
  return Math.min(120, Math.max(5, seconds))
}

function parseBuzzTime(value) {
  const seconds = parseInt(value, 10)
  if (!Number.isFinite(seconds)) return DEFAULT_BUZZ_TIME
  return Math.min(60, Math.max(2, seconds))
}

function parseRevealTime(value) {
  const seconds = parseInt(value, 10)
  if (!Number.isFinite(seconds)) return DEFAULT_REVEAL_TIME
  return Math.min(30, Math.max(1, seconds))
}

const rooms = {}

app.get('/', (req, res) => {
  res.render('index', { rooms: rooms })
})

app.post("/room", upload.single('pack'), (req, res) => {
  if (!req.body.room || rooms[req.body.room] != null) { 
    return res.redirect('/')
  }

  if (!req.file) {
    return res.redirect('/')
  }

  let judge = null
  if (req.body.autojudge) judge = "Autojudge"

  const answerTime = parseAnswerTime(req.body.answerTime)
  const buzzTime = parseBuzzTime(req.body.buzzTime)
  const revealTime = parseRevealTime(req.body.revealTime)

  let jsonContent
  try {
    jsonContent = JSON.parse(req.file.buffer.toString('utf8'))
  } catch (e) {
    return res.redirect('/')
  }

  rooms[req.body.room] = {
    name: req.body.room,
    judge: judge,
    players: {},
    pack: jsonContent,
    turn: null,
    canAnswer: false,
    width: 100,
    answerTime: answerTime,
    buzzTime: buzzTime,
    revealTime: revealTime,
    answerTimer: null,
    buzzTimer: null,
    revealTimer: null,
    currentRound: Object.keys(Object.values(jsonContent)[0].rounds)[0],
    currentQuestion: null
  }

  // Save the uploaded pack into the reusable pack library, so it shows up
  // next time via "Host → pick a pack". Non-blocking — a save failure here
  // shouldn't stop the room from starting.
  const packName = Object.keys(jsonContent)[0]
  db.savePack(packName, jsonContent).catch((err) => {
    console.error('Failed to save uploaded pack to the database:', err.message)
  })

  res.redirect(req.body.room)
})

app.post("/proposedRoom", async (req, res) => {
  const proposedRoom = req.body.proposedRoom

  // Only allow safe names — this doubles as the pack name looked up in the DB.
  if (!proposedRoom || !/^[a-zA-Z0-9_-]+$/.test(proposedRoom)) {
    return res.redirect('/')
  }

  if (rooms[proposedRoom] != null) { 
    return res.redirect('/')
  }

  let judge = null
  if (req.body.proposedAutojudge) judge = "Autojudge"

  const answerTime = parseAnswerTime(req.body.proposedAnswerTime)
  const buzzTime = parseBuzzTime(req.body.proposedBuzzTime)
  const revealTime = parseRevealTime(req.body.proposedRevealTime)

  let jsonContent
  try {
    jsonContent = await db.getPack(proposedRoom)
  } catch (err) {
    console.error('Failed to load pack from the database:', err.message)
    return res.redirect('/')
  }

  if (!jsonContent) {
    return res.redirect('/')
  }

  rooms[proposedRoom] = {
    name: proposedRoom,
    judge: judge,
    players: {},
    pack: jsonContent,
    turn: null,
    canAnswer: false,
    width: 100,
    answerTime: answerTime,
    buzzTime: buzzTime,
    revealTime: revealTime,
    answerTimer: null,
    buzzTimer: null,
    revealTimer: null,
    currentRound: Object.keys(Object.values(jsonContent)[0].rounds)[0],
    currentQuestion: null
  }

  res.redirect(proposedRoom)
})

app.get('/:room', (req, res) => {
  if (rooms[req.params.room] == null) { 
    return res.redirect('/')
  }

  res.render('room', { 
    roomName: req.params.room,
    roomPlayers: rooms[req.params.room].players
  })
})

const backEndPlayers = {}
const idPlayers = {}

io.on('connection', (socket) => {
  // Wrap every socket.on handler registered below in a try/catch. An
  // uncaught exception thrown inside a socket.io event handler crashes the
  // *entire* Node process — meaning one client hitting an edge case (e.g. a
  // duplicate connection, a stale room) would kill the game for every
  // connected room, not just their own session. Catching and logging here
  // keeps a single bad event from taking the whole server down.
  const rawOn = socket.on.bind(socket)
  socket.on = (event, handler) => {
    rawOn(event, async (...args) => {
      try {
        await handler(...args)
      } catch (err) {
        console.error(`Unhandled error in '${event}' handler:`, err)
      }
    })
  }

  socket.on('requestProposedRoom', () => {
    db.listPacks()
      .then((filesName) => {
        socket.emit('proposedRoomArray', filesName)
      })
      .catch((err) => {
        console.error('Failed to list packs from the database:', err.message)
        socket.emit('proposedRoomArray', [])
      })
  })

  socket.on('giveUUID', () => {
    socket.emit('takeUUID', crypto.randomUUID())
  })

  socket.on('connected', ({uuid}) => {
    if (!backEndPlayers[uuid]){
      // Store the in-flight promise on the socket itself — every other
      // handler below awaits it first, so a 'playerConnect' (or any other
      // event) that arrives before the DB lookup finishes waits for the
      // player record to exist instead of crashing on `undefined`.
      socket.playerReady = db.getOrCreatePlayer(uuid)
        .then((profile) => {
          // A second event for the same uuid could have arrived while we
          // were waiting on the DB — don't clobber it if so.
          if (backEndPlayers[uuid]) return

          backEndPlayers[uuid] = {
            name: profile.name || "User",
            picture: profile.picture || "",
            score: 0,
            room: null,
            id: socket.id
          }
          idPlayers[socket.id] = uuid

          socket.emit('loadProfile', ({name: backEndPlayers[uuid].name,
            picture: backEndPlayers[uuid].picture
          }))
          socket.emit('updateRooms', rooms)
        })
        .catch((err) => {
          console.error('Failed to load player profile from the database:', err.message)
          // Fall back to an in-memory-only profile so the app still works
          // even if the database is temporarily unreachable.
          backEndPlayers[uuid] = {
            name: "User",
            picture: "",
            score: 0,
            room: null,
            id: socket.id
          }
          idPlayers[socket.id] = uuid
          socket.emit('updateRooms', rooms)
        })
      return
    }
    else {
      // Instead of trying to guess whether the previous connection is
      // still alive (which depends on how fast a dead socket gets
      // detected — slow and unreliable behind Render's proxy), just make
      // the newest connection win: force-close the old one if it's still
      // registered, and take over immediately. This is also the more
      // sensible behavior for a real player reconnecting (new tab, page
      // reload, network blip) rather than blocking them out.
      const previousSocketId = backEndPlayers[uuid].id
      if (previousSocketId && previousSocketId !== socket.id) {
        const previousSocket = io.sockets.sockets.get(previousSocketId)
        if (previousSocket) previousSocket.disconnect(true)
      }

      idPlayers[socket.id] = uuid
      backEndPlayers[uuid].id = socket.id

      socket.emit('loadProfile', ({name: backEndPlayers[uuid].name,
        picture: backEndPlayers[uuid].picture
      }))
    }

    socket.emit('updateRooms', rooms)
  })

  socket.on('playerConnect', async ({room}) => {
    if (socket.playerReady) await socket.playerReady

    // If 'connected' never attached this socket to a player record (e.g.
    // this uuid already had an active connection elsewhere and got
    // 'alreadyInRoom' instead), there is nothing to join a room with —
    // bail out instead of crashing on `backEndPlayers[undefined]`.
    if (!idPlayers[socket.id] || !backEndPlayers[idPlayers[socket.id]]) return

    if (!rooms[room]) return

    const game = {}
    game.rounds = {}
    const rounds = Object.keys(Object.values(rooms[room].pack)[0].rounds)
    const gameRounds =  rounds.slice(rounds.indexOf(rooms[room].currentRound))
    for (const round in gameRounds) {
      if (gameRounds[round] == rooms[room].currentRound) {
        game.rounds[gameRounds[round]] = {}
        game.rounds[gameRounds[round]].questions = {}
        const questions = Object.values(rooms[room].pack)[0].rounds[gameRounds[round]].questions
        for (const question in questions) {
          if (questions[question].passed == 0){
            game.rounds[gameRounds[round]].questions[question] = questions[question]
          }
        }
      } else game.rounds[gameRounds[round]] = Object.values(rooms[room].pack)[0].rounds[gameRounds[round]]
    }

    socket.emit('loadRoom', game)

    backEndPlayers[idPlayers[socket.id]].score = 0
    backEndPlayers[idPlayers[socket.id]].room = room

    if (!rooms[room].judge || rooms[room].judge == socket.id) {
      rooms[room].judge = socket.id
    } else {
      rooms[room].players[socket.id] = backEndPlayers[idPlayers[socket.id]] 
    }

    if (!rooms[room].turn && rooms[room].judge != socket.id) {
      rooms[room].turn = socket.id
    }

    let judgeName = "Autojudge"
    let judgePicture = null

    if (rooms[room].judge != "Autojudge") {
      judgeName = backEndPlayers[idPlayers[rooms[room].judge]].name
      judgePicture = backEndPlayers[idPlayers[rooms[room].judge]].picture
    }

    io.emit('updateRooms', rooms)
    io.to(rooms[room].judge).emit('judgeChange', {judgeName: judgeName, judgePicture: judgePicture})
    io.to(rooms[room].judge).emit('updatePlayers', rooms[room].players)
    io.to(rooms[room].judge).emit('judgeControl')
    if (rooms[room].turn) io.to(rooms[room].judge).emit('updateTurn', rooms[room].turn)
    for (const player in rooms[room].players) {
      io.to(player).emit('judgeChange', {judgeName: judgeName, judgePicture: judgePicture})
      io.to(player).emit('updatePlayers', rooms[room].players)
      if (rooms[room].turn) io.to(player).emit('updateTurn', rooms[room].turn)
    }
  })

  socket.on('changeProfilePicture', async ({image}) => {
    if (socket.playerReady) await socket.playerReady
    const uuid = idPlayers[socket.id]
    if (!uuid || !backEndPlayers[uuid]) return
    backEndPlayers[uuid].picture = image
    db.updatePlayerPicture(uuid, image).catch((err) => {
      console.error('Failed to save profile picture to the database:', err.message)
    })
  })

  socket.on('skipRound', ({room}) => {
    let lastRound = 0
    const rounds = Object.keys(Object.values(rooms[room].pack)[0].rounds)
    const currentCount = rounds.indexOf(rooms[room].currentRound)
    if (rounds.length > currentCount + 1) rooms[room].currentRound = rounds[currentCount + 1]
    else lastRound = 1

    if (lastRound) {
      let bestPlayerId = null
      for (const playerId in rooms[room].players) {
        if (!bestPlayerId || rooms[room].players[playerId].score > rooms[room].players[bestPlayerId].score) {
          bestPlayerId = playerId
        }
      }
      if (bestPlayerId) {
        db.logGameResult({
          roomName: room,
          packName: Object.keys(rooms[room].pack)[0],
          winnerName: rooms[room].players[bestPlayerId].name,
          winnerScore: rooms[room].players[bestPlayerId].score
        }).catch((err) => {
          console.error('Failed to log game result to the database:', err.message)
        })
      }
    }

    io.to(rooms[room].judge).emit('showQuestionsSkip')
    if (lastRound) io.to(rooms[room].judge).emit('gameFinished')
    for (const play in rooms[room].players) {
      io.to(play).emit('showQuestionsSkip')
      if (lastRound) io.to(play).emit('gameFinished')
    }
  })

  socket.on('changeProfileName', async ({name}) => {
    if (socket.playerReady) await socket.playerReady
    const uuid = idPlayers[socket.id]
    if (!uuid || !backEndPlayers[uuid]) return
    backEndPlayers[uuid].name = name
    db.updatePlayerName(uuid, name).catch((err) => {
      console.error('Failed to save profile name to the database:', err.message)
    })
  })

  socket.on('disconnect', async (reason) => {
    if (socket.playerReady) await socket.playerReady
    const uuid = idPlayers[socket.id]

    if (backEndPlayers[uuid]) {
      // A newer connection for this uuid may already be active (see the
      // 'connected' handler above, which force-disconnects a stale old
      // socket) — this socket's *own* room membership still needs cleaning
      // up either way, so that part always runs. Only the shared `.id`
      // field is guarded below, so a late/forced disconnect from an old
      // socket can't wipe out a newer, already-active session's id.

      if (backEndPlayers[idPlayers[socket.id]].room) {
        if (rooms[backEndPlayers[idPlayers[socket.id]].room].turn == socket.id) {
          var players = Object.keys(rooms[backEndPlayers[idPlayers[socket.id]].room].players)
          var nextPlayer = socket.id
          if (players.length > 1) {
            players.splice(players.indexOf(socket.id), 1)
            nextPlayer = players[Math.floor(Math.random() * players.length)]
            rooms[backEndPlayers[idPlayers[socket.id]].room].turn = nextPlayer
          } else {
            nextPlayer = null
            rooms[backEndPlayers[idPlayers[socket.id]].room].turn = null
          }

          io.to(rooms[backEndPlayers[idPlayers[socket.id]].room].judge).emit('updateTurn', (nextPlayer))
          for (const play in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
            io.to(play).emit('updateTurn', (nextPlayer))
          }
        }

        if (rooms[backEndPlayers[idPlayers[socket.id]].room].judge == socket.id) {
          rooms[backEndPlayers[idPlayers[socket.id]].room].judge = null
          for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
            io.to(player).emit('judgeChange', {judgeName: null, judgePicture: null})
          }
        } else
        if (rooms[backEndPlayers[idPlayers[socket.id]].room].players[socket.id] == backEndPlayers[idPlayers[socket.id]]) {
          delete rooms[backEndPlayers[idPlayers[socket.id]].room].players[socket.id]
          io.to(rooms[backEndPlayers[idPlayers[socket.id]].room].judge).emit('updatePlayers', rooms[backEndPlayers[idPlayers[socket.id]].room].players)
          for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
            io.to(player).emit('updatePlayers', rooms[backEndPlayers[idPlayers[socket.id]].room].players)
          }
        }

        if (Object.keys(rooms[backEndPlayers[idPlayers[socket.id]].room].players).length == 0 &&
        (!rooms[backEndPlayers[idPlayers[socket.id]].room].judge || rooms[backEndPlayers[idPlayers[socket.id]].room].judge == "Autojudge")){
          delete rooms[backEndPlayers[idPlayers[socket.id]].room]
        }
      }

      backEndPlayers[idPlayers[socket.id]].score = 0
      backEndPlayers[idPlayers[socket.id]].room = null
      // Only clear `.id` if this disconnecting socket is still the one on
      // record for this uuid — if a newer connection already took over,
      // leave it alone so that active session isn't marked as gone.
      if (backEndPlayers[uuid].id === socket.id) {
        backEndPlayers[uuid].id = null
      }
      delete idPlayers[socket.id]
      io.emit('updateRooms', rooms)
    }
  })

  socket.on('playerQuestionKeydown', async ({room, player, width}) => {
    if (socket.playerReady) await socket.playerReady
    if (!idPlayers[socket.id] || !backEndPlayers[idPlayers[socket.id]]) return

    // Someone buzzed in before the server's own "nobody answered" timeout —
    // cancel it, we're moving into the answer phase now.
    if (rooms[room].buzzTimer) {
      clearTimeout(rooms[room].buzzTimer)
      rooms[room].buzzTimer = null
    }

    rooms[room].turn = player
    rooms[room].canAnswer = false
    rooms[room].width = width

    // The server, not the client, now owns the answer deadline: whatever
    // the player was buzzing in with, they get a fresh, fixed window from
    // this exact moment to actually submit an answer.
    if (rooms[room].answerTimer) clearTimeout(rooms[room].answerTimer)
    const questionInProgress = rooms[room].currentQuestion
    const answerDurationMs = (rooms[room].answerTime || DEFAULT_ANSWER_TIME) * 1000
    rooms[room].answerDeadline = Date.now() + answerDurationMs
    rooms[room].answerTimer = setTimeout(() => {
      if (rooms[room]) rooms[room].answerTimer = null
      // Guard against a stale timer firing after this question was
      // already resolved some other way (manual skip, room cleanup, ...).
      if (rooms[room] && rooms[room].currentQuestion === questionInProgress) {
        sendAnswer(room, rooms[room].turn, rooms[room].currentQuestion)
      }
    }, answerDurationMs)

    io.to(rooms[room].judge).emit('provideAnswer', {
      player: player,
      question: rooms[room].currentQuestion,
      answerDeadline: rooms[room].answerDeadline})
    for (const playerC in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
      io.to(playerC).emit('provideAnswer', {
        player: player,
        question: rooms[room].currentQuestion,
        answerDeadline: rooms[room].answerDeadline})
    }
  })

  socket.on('skipQuestion', ({room}) => {
    if (rooms[room].buzzTimer) {
      clearTimeout(rooms[room].buzzTimer)
      rooms[room].buzzTimer = null
    }
    if (rooms[room].answerTimer) {
      clearTimeout(rooms[room].answerTimer)
      rooms[room].answerTimer = null
    }
    if (rooms[room].revealTimer) {
      clearTimeout(rooms[room].revealTimer)
      rooms[room].revealTimer = null
    }
    if (rooms[room].currentQuestion)
      sendAnswer(room, rooms[room].turn, rooms[room].currentQuestion)
  })

  socket.on('playerQuestion', async ({room, question, nextPlayer}) => {
    if (socket.playerReady) await socket.playerReady
    if (!idPlayers[socket.id] || !backEndPlayers[idPlayers[socket.id]]) return
    rooms[room].currentQuestion = question
    rooms[room].turn = nextPlayer
    rooms[room].canAnswer = true

    // Nobody buzzed in — the server, not a client, decides when to give up
    // on this question and move on.
    if (rooms[room].buzzTimer) clearTimeout(rooms[room].buzzTimer)
    const questionInProgress = question
    const buzzDurationMs = (rooms[room].buzzTime || DEFAULT_BUZZ_TIME) * 1000
    rooms[room].buzzDeadline = Date.now() + buzzDurationMs
    rooms[room].buzzTimer = setTimeout(() => {
      if (rooms[room]) rooms[room].buzzTimer = null
      if (rooms[room] && rooms[room].currentQuestion === questionInProgress) {
        sendAnswer(room, rooms[room].turn, rooms[room].currentQuestion)
      }
    }, buzzDurationMs)

    io.to(rooms[room].judge).emit('questionDisplay', {
      question: question,
      widthS: rooms[room].width,
      buzzDeadline: rooms[room].buzzDeadline})
    for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
      io.to(player).emit('questionDisplay', {
        question: question,
        widthS: rooms[room].width,
        buzzDeadline: rooms[room].buzzDeadline})
    }
  })

  socket.on('playerAnswer', async ({room, question, answer}) => {
    if (socket.playerReady) await socket.playerReady
    if (!idPlayers[socket.id] || !backEndPlayers[idPlayers[socket.id]]) return

    // The player responded in time — the server-side deadline no longer applies.
    if (rooms[room].answerTimer) {
      clearTimeout(rooms[room].answerTimer)
      rooms[room].answerTimer = null
    }

    // Kept around so it can still be shown to everyone once the judge
    // (or Autojudge) has made a decision — the live "showAnswer" broadcast
    // below disappears as soon as the question view changes, this persists.
    rooms[room].lastAnswer = {
      playerName: backEndPlayers[idPlayers[socket.id]].name,
      text: answer
    }

    const questionInfo = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions[question]
    let correctAns
    if (questionInfo.type == "test") correctAns = questionInfo.answer[questionInfo.answer[4]-1]
    else correctAns = questionInfo.answer

    if (rooms[room].judge == "Autojudge"){
      if (answer == correctAns)
        correctAnswer(room, socket.id, question)
      else
        incorrectAnswer(room, socket.id, question)
    } else
      io.to(rooms[room].judge).emit('checkAnswer', {
        player: socket.id,
        question: question,
        correctAnswer: correctAns,
        answer: answer
      })
    
    for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
      io.to(player).emit('showAnswer', {
        player: socket.id,
        answer: answer,
        judge: rooms[room].judge == "Autojudge",
        widthS: rooms[room].width
      })
    }
  })

  socket.on('correctAnswer', ({room, player, question}) => {
    correctAnswer(room, player, question)
  })

  socket.on('incorrectAnswer', ({room, player, question}) => {
    incorrectAnswer(room, player, question)
  })

  function broadcastAnswerResolved(room, correct) {
    if (!rooms[room].lastAnswer) return
    const payload = {
      playerName: rooms[room].lastAnswer.playerName,
      text: rooms[room].lastAnswer.text,
      correct: correct
    }
    io.to(rooms[room].judge).emit('answerResolved', payload)
    for (const play in rooms[room].players) {
      io.to(play).emit('answerResolved', payload)
    }
  }

  function correctAnswer (room, player, question) {
    const quest = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions[question]

    switch (quest.bonus){
      case "none":
        rooms[room].players[player].score += Number(quest.cost)
        break
      case "choose":
        rooms[room].players[player].score += Number(quest.cost)
        break
      case "double":
        rooms[room].players[player].score += 2*Number(quest.cost)
        break
    }

    broadcastAnswerResolved(room, true)

    // Give everyone a moment to see the verdict before the board moves on.
    if (rooms[room].revealTimer) clearTimeout(rooms[room].revealTimer)
    rooms[room].revealTimer = setTimeout(() => {
      if (rooms[room]) rooms[room].revealTimer = null
      if (rooms[room] && rooms[room].currentQuestion === question) {
        sendAnswer(room, player, question)
      }
    }, (rooms[room].revealTime || DEFAULT_REVEAL_TIME) * 1000)
  }

  function incorrectAnswer (room, player, question) {
    const quest = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions[question]
    const score = rooms[room].players[player].score

    rooms[room].players[player].score = Math.max(0, score - 50)

    if (quest.bonus == "punishment") rooms[room].players[player].score = Math.max(0, score - Number(quest.cost))

    broadcastAnswerResolved(room, false)

    // Give everyone a moment to see the verdict before the question reopens.
    if (rooms[room].revealTimer) clearTimeout(rooms[room].revealTimer)
    rooms[room].revealTimer = setTimeout(() => {
      if (rooms[room]) rooms[room].revealTimer = null
      if (!rooms[room] || rooms[room].currentQuestion !== question) return

      // Wrong answer reopens the same question for someone else to buzz in —
      // that's a fresh buzz-in window, so the server's own deadline for it
      // needs restarting too, same as when a question is first shown.
      if (rooms[room].buzzTimer) clearTimeout(rooms[room].buzzTimer)
      const questionInProgress = question
      const buzzDurationMs = (rooms[room].buzzTime || DEFAULT_BUZZ_TIME) * 1000
      rooms[room].buzzDeadline = Date.now() + buzzDurationMs
      rooms[room].buzzTimer = setTimeout(() => {
        if (rooms[room]) rooms[room].buzzTimer = null
        if (rooms[room] && rooms[room].currentQuestion === questionInProgress) {
          sendAnswer(room, rooms[room].turn, rooms[room].currentQuestion)
        }
      }, buzzDurationMs)

      if (rooms[room].judge != "Autojudge"){
        io.to(rooms[room].judge).emit('updatePlayers', rooms[room].players)
        io.to(rooms[room].judge).emit('questionDisplay', {
          question: question,
          widthS: rooms[room].width,
          buzzDeadline: rooms[room].buzzDeadline})
      }
      for (const play in rooms[room].players) {
        io.to(play).emit('updatePlayers', rooms[room].players)
        io.to(play).emit('questionDisplay', {
          question: question,
          widthS: rooms[room].width,
          buzzDeadline: rooms[room].buzzDeadline})
      }
    }, (rooms[room].revealTime || DEFAULT_REVEAL_TIME) * 1000)
  }

  function sendAnswer (room, player, question){
    rooms[room].width = 100

    const info = question.split('_')
    const round = Object.keys(Object.values(rooms[room].pack)[0].rounds)[info[1]]
    Object.values(rooms[room].pack)[0].rounds[round].questions[question].passed = 1

    rooms[room].currentQuestion = null

    let continueRound = 0
    const questions = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions
    for (const question in questions) {
      if (questions[question].passed == 0) {
        continueRound = 1
        break
      }
    }

    let lastRound = 0
    if (!continueRound){
      const rounds = Object.keys(Object.values(rooms[room].pack)[0].rounds)
      const currentCount = rounds.indexOf(rooms[room].currentRound)
      if (rounds.length > currentCount + 1) rooms[room].currentRound = rounds[currentCount + 1]
      else lastRound = 1
    }

    if (lastRound) {
      let bestPlayerId = null
      for (const playerId in rooms[room].players) {
        if (!bestPlayerId || rooms[room].players[playerId].score > rooms[room].players[bestPlayerId].score) {
          bestPlayerId = playerId
        }
      }
      if (bestPlayerId) {
        db.logGameResult({
          roomName: room,
          packName: Object.keys(rooms[room].pack)[0],
          winnerName: rooms[room].players[bestPlayerId].name,
          winnerScore: rooms[room].players[bestPlayerId].score
        }).catch((err) => {
          console.error('Failed to log game result to the database:', err.message)
        })
      }
    }

    if (rooms[room].judge != "Autojudge"){
      io.to(rooms[room].judge).emit('updatePlayers', rooms[backEndPlayers[idPlayers[socket.id]].room].players)
      io.to(rooms[room].judge).emit('showQuestions', ({player: player, question: question}))
      io.to(rooms[room].judge).emit('updateTurn', (player))
      if (lastRound) io.to(rooms[room].judge).emit('gameFinished')
    }
    for (const play in rooms[room].players) {
      io.to(play).emit('updatePlayers', rooms[room].players)
      io.to(play).emit('showQuestions', ({player: player, question: question}))
      io.to(play).emit('updateTurn', (player))
      if (lastRound) io.to(play).emit('gameFinished')
    }
  }
})

db.initSchema()
  .then(() => {
    server.listen(port)
    console.log(`Server listening on port ${port}`)
  })
  .catch((err) => {
    console.error('Could not initialize the database — server not started.', err)
    process.exit(1)
  })