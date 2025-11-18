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

testPack = require('./Test.json')

rooms["Демонстрація"] = {
    name: "Демонстрація",
    judge: null,
    players: {},
    pack: testPack,
    turn: null,
    currentRound: Object.keys(Object.values(testPack)[0].rounds)[0],
    currentQuestion: null
  }

app.get('/', (req, res) => {
  res.render('index', { rooms: rooms })
})

app.post("/room", upload.single('pack'), (req, res) => {
  if (rooms[req.body.room] != null) { 
    return res.redirect('/')
  }

  const jsonContent = JSON.parse(req.file.buffer.toString('utf8'))

  rooms[req.body.room] = {
    name: req.body.room,
    judge: null,
    players: {},
    pack: jsonContent,
    turn: null,
    currentRound: Object.keys(Object.values(jsonContent)[0].rounds)[0],
    currentQuestion: null
  }

  res.redirect(req.body.room)
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
  socket.on('giveUUID', () => {
    socket.emit('takeUUID', crypto.randomUUID())
  })

  socket.on('connected', ({uuid}) => {
    if (!backEndPlayers[uuid]){
      backEndPlayers[uuid] = {
        name: "User",
        picture: "",
        score: 0 ,
        room: null
      }
    }
    else {
      socket.emit('loadProfile', ({name: backEndPlayers[uuid].name,
        picture: backEndPlayers[uuid].picture
      }))
    }
    
    idPlayers[socket.id] = uuid

    socket.emit('updateRooms', rooms)
  })

  socket.on('playerConnect', ({room}) => {
    game = {}
    game.rounds = {}
    rounds = Object.keys(Object.values(rooms[room].pack)[0].rounds)
    gameRounds =  rounds.slice(rounds.indexOf(rooms[room].currentRound))
    for (round in gameRounds) {
      if (gameRounds[round] == rooms[room].currentRound) {
        game.rounds[gameRounds[round]] = {}
        game.rounds[gameRounds[round]].questions = {}
        questions = Object.values(rooms[room].pack)[0].rounds[gameRounds[round]].questions
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

    io.emit('updateRooms', rooms)
    io.to(rooms[room].judge).emit('judgeChange', backEndPlayers[idPlayers[rooms[room].judge]])
    io.to(rooms[room].judge).emit('updatePlayers', rooms[room].players)
    if (rooms[room].turn) io.to(rooms[room].judge).emit('updateTurn', rooms[room].turn)
    for (const player in rooms[room].players) {
      io.to(player).emit('judgeChange', backEndPlayers[idPlayers[rooms[room].judge]])
      io.to(player).emit('updatePlayers', rooms[room].players)
      if (rooms[room].turn) io.to(player).emit('updateTurn', rooms[room].turn)
    }
  })

  socket.on('changeProfilePicture', ({image}) => {
    backEndPlayers[idPlayers[socket.id]].picture = image
  })

  socket.on('changeProfileName', ({name}) => {
    backEndPlayers[idPlayers[socket.id]].name = name
  })

  socket.on('disconnect', (reason) => {
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
            io.to(player).emit('judgeChange', rooms[backEndPlayers[idPlayers[socket.id]].room].judge)
          }
        } else
        if (rooms[backEndPlayers[idPlayers[socket.id]].room].players[socket.id] == backEndPlayers[idPlayers[socket.id]]) {
          delete rooms[backEndPlayers[idPlayers[socket.id]].room].players[socket.id]
          io.to(rooms[backEndPlayers[idPlayers[socket.id]].room].judge).emit('updatePlayers', rooms[backEndPlayers[idPlayers[socket.id]].room].players)
          for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
            io.to(player).emit('updatePlayers', rooms[backEndPlayers[idPlayers[socket.id]].room].players)
          }
        }

        if (Object.keys(rooms[backEndPlayers[idPlayers[socket.id]].room].players).length == 0 && !rooms[backEndPlayers[idPlayers[socket.id]].room].judge){
          delete rooms[backEndPlayers[idPlayers[socket.id]].room]
        }
      }

      backEndPlayers[idPlayers[socket.id]].score = 0
      backEndPlayers[idPlayers[socket.id]].room = null
      delete idPlayers[socket.id]
      io.emit('updateRooms', rooms)
    }
  })

  socket.on('keydown', ({room, keycode}) => {
    socket.to(rooms[room].players).broadcast.emit('updatePlayers', rooms[room].players)
  })

  socket.on('playerQuestion', ({room, question, nextPlayer}) => {
    rooms[room].currentQuestion = question
    rooms[room].turn = nextPlayer
    io.to(rooms[room].judge).emit('questionDisplay', {
      player: nextPlayer,
      question: question})
    for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
      io.to(player).emit('questionDisplay', {
        player: nextPlayer,
        question: question})
    }
  })

  socket.on('playerAnswer', ({room, question, answer}) => {
    questionInfo = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions[question]
    if (questionInfo.type == "test") correctAnswer = questionInfo.answer[questionInfo.answer[4]-1]
    else correctAnswer = questionInfo.answer

    io.to(rooms[room].judge).emit('checkAnswer', {
      player: socket.id,
      question: question,
      correctAnswer: correctAnswer,
      answer: answer
    })
    for (const player in rooms[backEndPlayers[idPlayers[socket.id]].room].players) {
      io.to(player).emit('showAnswer', {
        player: socket.id,
        answer: answer})
    }
  })

  socket.on('correctAnswer', ({room, player, question}) => {
    quest = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions[question]

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
  })

  socket.on('incorrectAnswer', ({room, player, question}) => {
    quest = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions[question]
    score = rooms[room].players[player].score

    if (quest.bonus == "punishment") rooms[room].players[player].score = Math.max(0, score - Number(quest.cost))
    
    var players = Object.keys(rooms[backEndPlayers[idPlayers[socket.id]].room].players)
    var nextPlayer = player
    if (players.length > 1) {
      players.splice(players.indexOf(player), 1)
      nextPlayer = players[Math.floor(Math.random() * players.length)]
      rooms[room].turn = nextPlayer
    }

    sendAnswer(room, nextPlayer, question)
  })

  function sendAnswer (room, player, question){
    info = question.split('_')
    round = Object.keys(Object.values(rooms[room].pack)[0].rounds)[info[1]]
    Object.values(rooms[room].pack)[0].rounds[round].questions[question].passed = 1

    rooms[room].currentQuestion = null

    continueRound = 0
    questions = Object.values(rooms[room].pack)[0].rounds[rooms[room].currentRound].questions
    for (const question in questions) {
      if (questions[question].passed == 0) {
        continueRound = 1
        break
      }
    }

    lastRound = 0
    if (!continueRound){
      rounds = Object.keys(Object.values(rooms[room].pack)[0].rounds)
      currentCount = rounds.indexOf(rooms[room].currentRound)
      if (rounds.length > currentCount + 1) rooms[room].currentRound = rounds[currentCount + 1]
      else lastRound = 1
    }

    io.to(rooms[room].judge).emit('updatePlayers', rooms[backEndPlayers[idPlayers[socket.id]].room].players)
    io.to(rooms[room].judge).emit('showQuestions', ({player: player, question: question}))
    io.to(rooms[room].judge).emit('updateTurn', (player))
    if (lastRound) io.to(rooms[room].judge).emit('gameFinished')
    for (const play in rooms[room].players) {
      io.to(play).emit('updatePlayers', rooms[room].players)
      io.to(play).emit('showQuestions', ({player: player, question: question}))
      io.to(play).emit('updateTurn', (player))
      if (lastRound) io.to(play).emit('gameFinished')
    }
  }
})

server.listen(port)
