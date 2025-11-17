let clientUuid = localStorage.getItem("CLIENT_UUID");

const socket = io()

socket.emit('connected', {
    uuid: clientUuid
  }
)

const frontEndPlayers = {}

var questionList = {}

var turn = null

var judge = false

socket.emit('playerConnect',  {
  room: roomName
})

socket.on('loadRoom', (game) => {
  questionList = game

  roundPlace = document.querySelector('#rounds')

  for (round in game.rounds) {
    questions = game.rounds[round].questions

    questionsButtons = ``
    
    for (const question in questions) {
      questionsButtons += `<button id="${question}" class="question">${questions[question].cost}</button>`
    }

    roundPlace.innerHTML += `<div id="round_${round}" style="display: none;">
      <div style="text-align: center; padding-bottom: 3%;">Round: ${round}</div>
      <div id="questions" class="questionsButtons">${questionsButtons}</div>
    </div>`
  }

  roundPlace.children[0].style = ""
})

socket.on('updateTurn', (player) => {
  turn = player
  if (!document.querySelector('#questionField').innerHTML){
    announcement = document.querySelector('#announcement')
    announcement.textContent = `Turn: ${frontEndPlayers[player].name}`
  }
})

socket.on('updatePlayers', (backEndPlayers) => {
  for (const id in backEndPlayers) {
    const backEndPlayer = backEndPlayers[id]

    picture = "/img/profilePicture.png"
    if (backEndPlayer.picture) picture = backEndPlayer.picture

    if (!frontEndPlayers[id]) {
      frontEndPlayers[id] = {
        name: backEndPlayer.name,
        picture: picture, 
        score: backEndPlayer.score
      }

      playerLabels = document.querySelector('#playerLabels')
      if (window.getComputedStyle(document.querySelector('.playersPlace2')).display != "none" && 
        Object.keys(frontEndPlayers).length % 2 == 0) playerLabels = document.querySelector('#playerLabels2')

      playerLabels.innerHTML += `<div data-id="player_${id}">
                      <img class="profilePicture" src="${picture}">
                      <div>${backEndPlayer.name}: ${backEndPlayer.score}</div>
                    </div>`
    } else {
      frontEndPlayers[id].name = backEndPlayer.name
      frontEndPlayers[id].score = backEndPlayer.score
      document.querySelector(`div[data-id="player_${id}"]`).innerHTML = `<div data-id="player_${id}">
                      <img class="profilePicture" src="${picture}">
                      <div>${backEndPlayer.name}: ${backEndPlayer.score}</div>
                    </div>`
    }
  }

  for (const id in frontEndPlayers) {
    if (!backEndPlayers[id]) {
      const divToDelete = document.querySelector(`div[data-id="player_${id}"]`)
      divToDelete.parentNode.removeChild(divToDelete)
      delete frontEndPlayers[id]
    }
  }
})

socket.on('judgeChange', (judge) => {
  var text
  announcement = document.querySelector('#announcement')
  field = document.querySelector('#questionField')
  waitForJudge = document.querySelector('#waitForJudge')
  if (!judge) {
    text = "<vacant>"
    announcement.style.display = "none"
    field.style.display = "none"
    waitForJudge.style.display = ""
    judgePresent = false
  }
  else {
    text = judge.name
    announcement.style.display = ""
    //field.style.display = ""
    waitForJudge.style.display = "none"
    judgePresent = true
  }
  picture = "/img/profilePicture.png"
  if (judge.picture) picture = judge.picture
  document.querySelector('#judgeLabel').innerHTML = `<img class="profilePicture" src="${picture}">
  <div>Judge: ${text}</div>`
})

socket.on('questionDisplay', ({player, question}) => {
  announcement = document.querySelector('#announcement')
  announcement.textContent = ``
  quest = document.querySelector('#questions')
  quest.style.display = "none"
  field = document.querySelector('#questionField')
  field.style.display = ""
  switch (Object.values(questionList.rounds)[0].questions[question].data){
    case "text":
      field.innerHTML = `<div>${Object.values(questionList.rounds)[0].questions[question].question}</div>`
      break
    case "image":
      field.innerHTML = `<img class="gamePicture" src=${Object.values(questionList.rounds)[0].questions[question].content}>`
      questText = Object.values(questionList.rounds)[0].questions[question].question
      if (questText) field.innerHTML +=`<div>${questText}</div>`
      break
  }

  info = question.split('_')
  numRound = info[1]
  numQuestion = info[2]

  questions = Object.values(questionList.rounds)[0].questions
  questionInfo = questions[Object.keys(questions)[numQuestion]]

  if (questionInfo.bonus == "double") field.innerHTML += "Bonus: Double"

  if (questionInfo.bonus == "punishment") field.innerHTML += "Bonus: Punishment"

  answerField = document.querySelector('#answerField')
  answerField.innerHTML = ""

  if(player == socket.id){
    switch (questionInfo.type){
      case "simple":
        answerField.innerHTML += 
          `<div>
            <input
              id="answerInput"
              type="text"
              class="form"
              placeholder="Answer"
            />
            <button id="answerButton" class="confirmButton true">
              Send
          </button>
          </div>`
        document.querySelector('#answerButton').addEventListener('click', () => {
          var answer = document.querySelector('#answerInput').value
          socket.emit('playerAnswer',  {
            room: roomName,
            question: question,
            answer: answer
          })
          answerField.innerHTML = ""
          announcement.textContent = "Wait for points"
        })
        break
      case "test":
        answerField.innerHTML += 
          `<div style="margin-bottom: 10px;">
            <button id="answerButton_0" class="confirmButton a">${questionInfo.answer[0]}</button>
            <button id="answerButton_1" class="confirmButton b">${questionInfo.answer[1]}</button>
          </div>
          <div>
            <button id="answerButton_2" class="confirmButton c">${questionInfo.answer[2]}</button>
            <button id="answerButton_3" class="confirmButton d">${questionInfo.answer[3]}</button>
          </div>`
        document.querySelector('#answerButton_0').addEventListener('click', () => {
          socket.emit('playerAnswer',  {
            room: roomName,
            question: question,
            answer: questionInfo.answer[0]
          })
          answerField.innerHTML = ""
          announcement.textContent = "Wait for points"
        })
        document.querySelector('#answerButton_1').addEventListener('click', () => {
          socket.emit('playerAnswer',  {
            room: roomName,
            question: question,
            answer: questionInfo.answer[1]
          })
          answerField.innerHTML = ""
          announcement.textContent = "Wait for points"
        })
        document.querySelector('#answerButton_2').addEventListener('click', () => {
          socket.emit('playerAnswer',  {
            room: roomName,
            question: question,
            answer: questionInfo.answer[2]
          })
          answerField.innerHTML = ""
          announcement.textContent = "Wait for points"
        })
        document.querySelector('#answerButton_3').addEventListener('click', () => {
          socket.emit('playerAnswer',  {
            room: roomName,
            question: question,
            answer: questionInfo.answer[3]
          })
          answerField.innerHTML = ""
          announcement.textContent = "Wait for points"
        })
        break
      case "true":
        answerField.innerHTML += 
          `<div>
            <button id="answerButton_t" class="confirmButton true">True</button>
            <button id="answerButton_f" class="confirmButton false">False</button>
          </div>`
        document.querySelector('#answerButton_t').addEventListener('click', () => {
          socket.emit('playerAnswer',  {
            room: roomName,
            question: question,
            answer: "true"
          })
          answerField.innerHTML = ""
          announcement.textContent = "Wait for points"
        })
        document.querySelector('#answerButton_f').addEventListener('click', () => {
          socket.emit('playerAnswer',  {
            room: roomName,
            question: question,
            answer: "false"
          })
          answerField.innerHTML = ""
          announcement.textContent = "Wait for points"
        })
        break
    }
  } else{
    announcement.textContent = `Waiting for answer from: ${frontEndPlayers[player].name}`
  }
})

socket.on('showAnswer', ({player, answer}) => {
  field = document.querySelector('#questionField')
  field.innerHTML += `<div>Answer: ${answer}</div>`
  announcement = document.querySelector('#announcement')
  announcement.textContent = `Waiting for points for: ${frontEndPlayers[player].name}`
})

socket.on('checkAnswer', ({player, question, correctAnswer, answer}) => {
  field = document.querySelector('#questionField')
  field.innerHTML += `<div>Answer: ${answer}</div><div>Correct answer: ${correctAnswer}</div>`
  announcement = document.querySelector('#announcement')
  announcement.textContent = ``
  answerField = document.querySelector('#answerField')
  answerField.innerHTML += 
    `<button id="correctAnswer" class="confirmButton true">
        Yes
      </button>
      <button id="incorrectAnswer" class="confirmButton false">
        No
      </button>`
  document.querySelector('#correctAnswer').addEventListener('click', () => {
    socket.emit('correctAnswer',  {
      room: roomName,
      player: player,
      question: question
    })
  })
  document.querySelector('#incorrectAnswer').addEventListener('click', () => {
    socket.emit('incorrectAnswer',  {
      room: roomName,
      player: player,
      question: question
    })
  })
})

socket.on('showQuestions', ({player, question}) => {
  field = document.querySelector('#questionField')
  field.style.display = "none"
  field.textContent = ""
  answerField = document.querySelector('#answerField')
  answerField.innerHTML = ``
  quest = document.querySelector('#questions')

  const toDel = document.querySelector(`#${question}`)
  quest.removeChild(toDel)

  quest.style.display = ""

  if (!quest.hasChildNodes()){
    rounds = document.querySelector('#rounds')
    toDelRound = rounds.firstChild
    rounds.removeChild(toDelRound)

    delete questionList.rounds[(Object.keys(questionList.rounds)[0])]

    nextRound = rounds.firstChild
    if (nextRound) nextRound.style = ""
  }

  announcement = document.querySelector('#announcement')
  announcement.textContent = `Turn: ${frontEndPlayers[player].name}`
})

socket.on('gameFinished', () => {
  field = document.querySelector('#questionField')
  field.style = ""
  field.textContent = ""
  answerField = document.querySelector('#answerField')
  answerField.innerHTML = ``
  quest = document.querySelector('#questions')

  var bestPlayer = Object.keys(frontEndPlayers)[0]
  for (play in frontEndPlayers){
    if (frontEndPlayers[play].score > frontEndPlayers[bestPlayer].score) bestPlayer = play
  }

  field.style = ""
  field.textContent = `Winner: ${frontEndPlayers[bestPlayer].name} \n with score: ${frontEndPlayers[bestPlayer].score}`

  announcement.textContent = ``
})

/*
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    socket.emit('keydown', {room: roomName, keycode: 'Space'})
  }
})
*/

document.querySelector('#gamefield').addEventListener('click', (
  event) => {
    if (!judgePresent || turn != socket.id) return
    questions = Object.values(questionList.rounds)[0].questions
    if (Object.keys(questions).includes(event.target.id)) {
      if (questions[event.target.id].bonus == "choose"){
        announcement = document.querySelector('#announcement').textContent = ""

        quest = document.querySelector('#questions')
        quest.style.display = "none"
        field = document.querySelector('#questionField')
        field.style = ""
        field.innerHTML = "<p>Bonus: Choose next player</p>"

        answerField = document.querySelector('#answerField')
        answerField.innerHTML = `<div id="nextPlayer"></div>`
        answerField = document.querySelector('#nextPlayer')

        for (const player in frontEndPlayers) {
          color = String.fromCharCode(Object.keys(frontEndPlayers).indexOf(player) % 4 + 97)
          answerField.innerHTML += `<button id="${player}" class="confirmButton ${color}">${frontEndPlayers[player].name}</button>`
        }

        document.querySelector(`#nextPlayer`).addEventListener('click', (ev) => {
          for (const player in frontEndPlayers) {
            if (ev.target.id == player) {
              socket.emit('playerQuestion',  {
                room: roomName,
                question: event.target.id,
                nextPlayer: player
              })
            }
          }
        })
      }
      else {
        socket.emit('playerQuestion',  {
          room: roomName,
          question: event.target.id,
          nextPlayer: socket.id
        })
      }
    }
  }
)