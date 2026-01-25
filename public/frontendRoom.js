let clientUuid = localStorage.getItem("CLIENT_UUID");

const socket = io()

socket.emit('connected', {
    uuid: clientUuid
  }
)

const frontEndPlayers = {}

var questionList = {}

var turn = null

var canAnswer = false

var alreadyAnswer = false

var judgeG = false

var interval;

var width = 100;

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

socket.on('alreadyInRoom', () => {
  pause = document.querySelector('#pauseMenu')
  pause.style = "position: absolute; height: 98%; width: 98%; font-size: 40px; z-index:1; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;"
  pause.textContent = "You already in game!"
})

socket.on('updateTurn', (player) => {
  turn = player
  announcement = document.querySelector('#announcement')
  announcement.textContent = `Turn: ${frontEndPlayers[player].name}`
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

socket.on('judgeChange', ({judgeName, judgePicture}) => {
  var text
  announcement = document.querySelector('#announcement')
  field = document.querySelector('#questionField')
  waitForJudge = document.querySelector('#waitForJudge')
  if (!judgeName) {
    text = "vacant"
    announcement.style.display = "none"
    field.style.display = "none"
    waitForJudge.style.display = ""
    judgePresent = false
  }
  else {
    text = judgeName
    announcement.style.display = ""
    //field.style.display = ""
    waitForJudge.style.display = "none"
    judgePresent = true
  }
  picture = "/img/Waiting.png"
  if (judgeName) {
    if (judgePicture) picture = judgePicture
    else picture = "/img/profilePicture.png"
  }
  document.querySelector('#judgeLabel').innerHTML = `<img class="profilePicture" src="${picture}">
  <div>Judge: ${text}</div>`
})

socket.on('judgeControl', () => {
  document.querySelector('#roundControl').innerHTML = `<button id="skipRound" class="confirmButton true">Skip round</button>`
  document.querySelector('#skipRound').addEventListener('click', () => {
          socket.emit('skipRound',  {
            room: roomName
          })
        })
})

socket.on('questionDisplay', ({question, widthS}) => {
  clearInterval(interval);
  width = widthS
  if (socket.id != turn && !alreadyAnswer) {
    canAnswer = true
  }

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

  activeField = document.querySelector('.activeField')
  activeField.style.display = ""

  answerField = document.querySelector('#answerField')
  answerField.innerHTML = `<button id="takeQuestion"><div id="myProgress">
    <div id="myBar"></div>
  </div></button>`

  document.querySelector('#takeQuestion').addEventListener('click', () => {
    if (canAnswer && socket.id != judgeG.id) {
      socket.emit('playerQuestionKeydown',  {
        room: roomName,
        player: socket.id,
        width: width
      })
    }
  })

  interval = setInterval(frame, 50);
})

function frame() {
  var elem = document.getElementById("myBar");
  if (width <= 0) {
    clearInterval(interval);
    socket.emit('skipQuestion',  {
      room: roomName
    })
  } else {
    width--;
    elem.style.width = width + "%";
  }
}

socket.on('provideAnswer', ({player, question}) => {
  canAnswer = false
  clearInterval(interval);
  
  info = question.split('_')
  numRound = info[1]
  numQuestion = info[2]

  questions = Object.values(questionList.rounds)[0].questions
  questionInfo = questions[Object.keys(questions)[numQuestion]]

  if (questionInfo.bonus == "double") field.innerHTML += "Bonus: Double"

  if (questionInfo.bonus == "punishment") field.innerHTML += "Bonus: Punishment"

  answerField = document.querySelector('#answerField')
  answerField.innerHTML = ""

  answerField.innerHTML = `<button id="takeQuestion"><div id="myProgress">
    <div id="myBar"></div>
  </div></button>`

  width = 100
  interval = setInterval(frame, 100);

  if(player == socket.id){
    alreadyAnswer = true
    
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

socket.on('showAnswer', ({player, answer, judge, widthS}) => {
  clearInterval(interval);

  width = widthS
  interval = setInterval(frame, 50);
  
  field = document.querySelector('#questionField')
  field.innerHTML += `<div>Answer: ${answer}</div>`
  if(!judge){
    announcement = document.querySelector('#announcement')
    announcement.textContent = `Waiting for points for: ${frontEndPlayers[player].name}`
  }
})

socket.on('checkAnswer', ({player, question, correctAnswer, answer}) => {
  clearInterval(interval);
  answerField.innerHTML = ""

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
  clearInterval(interval);
  width = 100
  canAnswer = false
  alreadyAnswer = false

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

socket.on('showQuestionsSkip', () => {
  clearInterval(interval);
  width = 100
  canAnswer = false
  alreadyAnswer = false

  field = document.querySelector('#questionField')
  field.style.display = "none"
  field.textContent = ""
  answerField = document.querySelector('#answerField')
  answerField.innerHTML = ``
  quest = document.querySelector('#questions')

  quest.style.display = ""

  rounds = document.querySelector('#rounds')
  toDelRound = rounds.firstChild
  rounds.removeChild(toDelRound)

  delete questionList.rounds[(Object.keys(questionList.rounds)[0])]

  nextRound = rounds.firstChild
  if (nextRound) nextRound.style = ""
})

socket.on('gameFinished', () => {
  field = document.querySelector('#questionField')
  field.style = ""
  field.textContent = ""
  answerField = document.querySelector('#answerField')
  answerField.innerHTML = ``
  quest = document.querySelector('#questions')
  document.querySelector('#roundControl').innerHTML = "";

  var bestPlayer = Object.keys(frontEndPlayers)[0]
  for (play in frontEndPlayers){
    if (frontEndPlayers[play].score > frontEndPlayers[bestPlayer].score) bestPlayer = play
  }

  field.style = ""
  field.textContent = `Winner: ${frontEndPlayers[bestPlayer].name} \n with score: ${frontEndPlayers[bestPlayer].score}`

  announcement.textContent = ``
})

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && canAnswer && socket.id != judgeG.id) {
    socket.emit('playerQuestionKeydown',  {
          room: roomName,
          player: socket.id,
          width: width
        })
  }
})

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
      canAnswer = true
    }
  }
)