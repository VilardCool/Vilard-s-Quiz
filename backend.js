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
      if (!backEndPlayers[uuid].id){
        idPlayers[socket.id] = uuid
        backEndPlayers[uuid].id = socket.id

        socket.emit('loadProfile', ({name: backEndPlayers[uuid].name,
          picture: backEndPlayers[uuid].picture
        }))
      }
      else socket.emit('alreadyInRoom')
    }

    socket.emit('updateRooms', rooms)
  })

  socket.on('playerConnect', async ({room}) => {
    if (socket.playerReady) await socket.playerReady
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
    if (!backEndPlayers[uuid]) return
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
    if (!backEndPlayers[uuid]) return
    backEndPlayers[uuid].name = name
    db.updatePlayerName(uuid, name).catch((err) => {
      console.error('Failed to save profile name to the database:', err.message)
    })
  })

  socket.on('disconnect', async (reason) => {
    if (socket.playerReady) await socket.playerReady
    if (backEndPlayers[idPlayers[socket.id]]) {
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
      backEndPlayers[idPlayers[socket.id]].id = null
      delete idPlayers[socket.id]
      io.emit('updateRooms', rooms)
    }
  })

  socket.on('playerQuestionKeydown', async ({room, player, width}) => {
    if (socket.playerReady) await socket.playerReady
    rooms[room].turn = player
    rooms[room].canAnswer = false
    rooms[room].width = width
    io.to(rooms[room].judge).emit('provideAnswer', {
      player: player,
      question: rooms[room].currentQuestion})
    for (const playerC in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
      io.to(playerC).emit('provideAnswer', {
        player: player,
        question: rooms[room].currentQuestion})
    }
  })

  socket.on('skipQuestion', ({room}) => {
    if (rooms[room].currentQuestion)
      sendAnswer(room, rooms[room].turn, rooms[room].currentQuestion)
  })

  socket.on('playerQuestion', async ({room, question, nextPlayer}) => {
    if (socket.playerReady) await socket.playerReady
    rooms[room].currentQuestion = question
    rooms[room].turn = nextPlayer
    rooms[room].canAnswer = true
    io.to(rooms[room].judge).emit('questionDisplay', {
      question: question,
      widthS: rooms[room].width})
    for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
      io.to(player).emit('questionDisplay', {
        question: question,
        widthS: rooms[room].width})
    }
  })

  socket.on('playerAnswer', async ({room, question, answer}) => {
    if (socket.playerReady) await socket.playerReady
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

    sendAnswer(room, player, question)
  }

  function incorrectAnswer (room, player, question) {
    const quest = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions[question]
    const score = rooms[room].players[player].score

    rooms[room].players[player].score = Math.max(0, score - 50)

    if (quest.bonus == "punishment") rooms[room].players[player].score = Math.max(0, score - Number(quest.cost))
    
    if (rooms[room].judge != "Autojudge"){
      io.to(rooms[room].judge).emit('updatePlayers', rooms[backEndPlayers[idPlayers[socket.id]].room].players)
      io.to(rooms[room].judge).emit('questionDisplay', {question: question, widthS: rooms[room].width})
    }
    for (const play in rooms[room].players) {
      io.to(play).emit('updatePlayers', rooms[room].players)
      io.to(play).emit('questionDisplay', {question: question, widthS: rooms[room].width})
    }
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