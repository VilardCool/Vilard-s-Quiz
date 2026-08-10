const pack = {}

pack["Name"] = {
  rounds: {}
}

document.querySelector('#createButton').addEventListener('click', (
  event) => {
    menu = document.querySelector('#menu')
    menu.setAttribute("style", "display: none;")
    create = document.querySelector('#create')
    create.setAttribute("style", "")
  }
)

document.querySelector('#menuButton').addEventListener('click', (
  event) => {
    menu = document.querySelector('#menu')
    menu.setAttribute("style", "")
    create = document.querySelector('#create')
    create.setAttribute("style", "display: none;")
  }
)

async function parseJsonFile(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()
    fileReader.onload = event => resolve(JSON.parse(event.target.result))
    fileReader.onerror = error => reject(error)
    fileReader.readAsText(file)
  })
}

document.querySelector('#import').addEventListener('click', () => {
    document.querySelector('#importPack').click()
  }
)

// Attached once (not inside the click handler above) — the previous version
// re-attached a new 'change' listener every time "Import" was clicked, so
// re-opening the file picker made every import run multiple times.
document.querySelector('#importPack').addEventListener('change', async (event) => {
  if (!event.target.files.length) return

  let importedPack
  try {
    importedPack = await parseJsonFile(event.target.files[0])
  } catch (err) {
    alert('Could not read this file — is it a valid pack .json?')
    event.target.value = ''
    return
  }

  const importedName = Object.keys(importedPack)[0]
  const importedRounds = importedPack[importedName].rounds

  // Give the pack being edited the imported pack's name, the same way typing
  // into the "Pack name" field would.
  const packNameInput = document.querySelector('#packName')
  packNameInput.value = importedName
  packNameInput.dispatchEvent(new Event('change'))

  for (const roundKey in importedRounds) {
    const importedRound = importedRounds[roundKey]

    // Create a new round exactly the way clicking "Add round" does, so it's
    // wired up with the same (correct) listeners that keep `pack` in sync.
    const addRoundButton = document.querySelector('#addRound')
    addRoundButton.click()
    const newRound = addRoundButton.previousElementSibling

    const roundNameInput = newRound.querySelector('input[id^="round_"]')
    roundNameInput.value = roundKey
    roundNameInput.dispatchEvent(new Event('change'))

    for (const questionKey in importedRound.questions) {
      const importedQuestion = importedRound.questions[questionKey]

      // Same idea: create the question via the real "Add question" button.
      const addQuestionButton = newRound.querySelector('button[id^="addQuestion_"]')
      addQuestionButton.click()
      const newQuestion = addQuestionButton.previousElementSibling

      const [, numRound, numQuestion] = newQuestion.getAttribute('name').split('_')

      const costInput = document.querySelector(`#cost_${numRound}_${numQuestion}`)
      costInput.value = importedQuestion.cost
      costInput.dispatchEvent(new Event('change'))

      const bonusSelect = document.querySelector(`#bonus_${numRound}_${numQuestion}`)
      bonusSelect.value = importedQuestion.bonus
      bonusSelect.dispatchEvent(new Event('change'))

      // Data (text/image) — set before the question text, since switching to
      // "image" replaces the content area with the drop zone markup.
      const dataSelect = document.querySelector(`#data_${numRound}_${numQuestion}`)
      dataSelect.value = importedQuestion.data
      dataSelect.dispatchEvent(new Event('change'))

      if (importedQuestion.data === 'image' && importedQuestion.content) {
        const img = document.querySelector(`#img_${numRound}_${numQuestion}`)
        img.src = importedQuestion.content
        const placeholderText = document.getElementById(`imageText_${numRound}_${numQuestion}`)
        if (placeholderText) placeholderText.remove()
        // No <input> fires a 'change' for a pasted-in base64 image, so write
        // it straight into the pack the same way a real drop would.
        pack[Object.keys(pack)[0]].rounds[roundKey].questions[newQuestion.getAttribute('name')].content = importedQuestion.content
      }

      const questionTextarea = document.querySelector(`#question_${numRound}_${numQuestion}`)
      questionTextarea.value = importedQuestion.question
      questionTextarea.dispatchEvent(new Event('change'))

      // Type (simple/test/true|false) — set before the answer value(s),
      // since switching type rebuilds the answer field(s).
      const typeSelect = document.querySelector(`#type_${numRound}_${numQuestion}`)
      typeSelect.value = importedQuestion.type
      typeSelect.dispatchEvent(new Event('change'))

      switch (importedQuestion.type) {
        case 'simple': {
          const answerInput = document.querySelector(`#answer_${numRound}_${numQuestion}`)
          answerInput.value = importedQuestion.answer
          answerInput.dispatchEvent(new Event('change'))
          break
        }
        case 'test': {
          for (let i = 0; i < 4; i++) {
            const optionInput = document.querySelector(`#answer_${numRound}_${numQuestion}_${i}`)
            optionInput.value = importedQuestion.answer[i]
            optionInput.dispatchEvent(new Event('change'))
          }
          const correctSelect = document.querySelector(`#answer_${numRound}_${numQuestion}_4`)
          correctSelect.value = importedQuestion.answer[4]
          correctSelect.dispatchEvent(new Event('change'))
          break
        }
        case 'true': {
          const trueFalseSelect = document.querySelector(`#answer_${numRound}_${numQuestion}_t`)
          trueFalseSelect.value = importedQuestion.answer
          trueFalseSelect.dispatchEvent(new Event('change'))
          break
        }
      }
    }
  }

  // Reset the file input so importing the same file again (or re-importing
  // after a mistake) fires 'change' again instead of silently doing nothing.
  event.target.value = ''
})

document.querySelector('#addRound').addEventListener('click', (
  event) => {
    newRound = document.createElement('div');
    addRound = document.querySelector('#addRound')
    create = addRound.parentElement
    create.insertBefore(newRound, addRound)

    numRound = Object.keys(pack[Object.keys(pack)[0]].rounds).length

    pack[Object.keys(pack)[0]].rounds[`round_${numRound}`] = {questions: {}}

    newRound.setAttribute("style", "margin-left: 5%")
    newRound.setAttribute("name", `round_${numRound}`)
    newRound.innerHTML = `<h3 style="display: inline-block;">Round name:</h3>
    <input id="round_${numRound}" name="round_${numRound}" type="text" placeholder="round_${numRound}">
    <button id="addQuestion_${numRound}" style="display: block;">Add question</button>`
    document.querySelector(`#round_${numRound}`).addEventListener('change', (
      event) => {
        roundName = document.querySelector(`#${event.target.id}`)
        oldName = roundName.name
        newName = roundName.value
        roundName.name = newName

        roundName.parentElement.setAttribute("name", `${newName}`)

        valueToReplace = pack[Object.keys(pack)[0]].rounds[oldName]
        pack[Object.keys(pack)[0]].rounds[newName] = valueToReplace
        delete pack[Object.keys(pack)[0]].rounds[oldName]
      }
    )

    document.querySelector(`#addQuestion_${numRound}`).addEventListener('click', (
      event) => {
        newQuestion = document.createElement('div');
        addQuestion = event.target
        round = addQuestion.parentElement
        round.insertBefore(newQuestion, addQuestion)

        info = event.target.id.split('_')
        numRound = info[1]
        numQuestion = Object.keys(pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions).length

        pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[`question_${numRound}_${numQuestion}`] = {
            cost: 0,
            data: "text",
            type: "simple",
            bonus: "none",
            content: "",
            question: "",
            answer: "",
            passed: 0
        }

        newQuestion.setAttribute("style", "margin-left: 5%; margin-top: 1%; background: rgba(0,0,0, 0.2);")
        newQuestion.setAttribute("name", `question_${numRound}_${numQuestion}`)
        newQuestion.innerHTML = `<p style="display: inline-block;">Cost:</p>
        <input id="cost_${numRound}_${numQuestion}" type="number" inputmode="numeric" min="0" max="10000" placeholder="0">
        <p style="display: inline-block; margin-left: 2%;">Data:</p>
        <select id="data_${numRound}_${numQuestion}">
          <option value="text">Text</option>
          <option value="image">Image</option>
        </select>
        <p style="display: inline-block; margin-left: 2%;">Type:</p>
        <select id="type_${numRound}_${numQuestion}">
          <option value="simple">Simple</option>
          <option value="test">Test</option>
          <option value="true">True | False</option>
        </select>
        <p style="display: inline-block; margin-left: 2%;">Bonus:</p>
        <select id="bonus_${numRound}_${numQuestion}">
          <option value="none">None</option>
          <option value="choose">Choose player</option>
          <option value="double">Double reward</option>
          <option value="punishment">Punishment</option>
        </select>
        <div id="contentField_${numRound}_${numQuestion}">
          <div id="content_${numRound}_${numQuestion}"></div>
          <p style="display: inline-block; vertical-align: top;">Question:</p>
          <textarea style="field-sizing: content; overflow-y: hidden; resize: none; width: 70%; margin-top: 2%;" id="question_${numRound}_${numQuestion}"></textarea>
        </div>
        <div id="answerField_${numRound}_${numQuestion}">
          <p style="display: inline-block;">Answer:</p>
          <div style="display: inline-block;" id="answer_type_${numRound}_${numQuestion}">
            <input id="answer_${numRound}_${numQuestion}" type="text">
          </div>
        </div>`
        
        document.querySelector(`#cost_${numRound}_${numQuestion}`).addEventListener('change', (
          event) => {
            change = document.querySelector(`#${event.target.id}`)
            question = change.parentElement
            round = question.parentElement
            pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].cost = change.value
          }
        )
        
        document.querySelector(`#data_${numRound}_${numQuestion}`).addEventListener('change', (
          event) => {
            change = document.querySelector(`#${event.target.id}`)
            question = change.parentElement
            round = question.parentElement
            pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].data = change.value

            info = event.target.id.split('_')
            numRound = info[1]
            numQuestion = info[2]

            content = document.querySelector(`#content_${numRound}_${numQuestion}`)
            switch(change.value){
              case "text":
                content.innerHTML = ""
                break
              case "image":
                content.innerHTML = `<div style="border: 1px solid #1d86dbff; 
                    border-radius: 4px; cursor: pointer; max-width: 100%;" id="image_${numRound}_${numQuestion}">
                  <p style="position: relative; z-index: -1" id="imageText_${numRound}_${numQuestion}">Drag and drop images here, or click to select files.</p>
                  <input type="file" style="position: relative; z-index: -1" id="file-input_${numRound}_${numQuestion}" accept="image/*" hidden>
                  <img id="img_${numRound}_${numQuestion}" style="position: relative; z-index: -1; max-width: 100%;">
                </div>`
                
                const dropZone = document.getElementById(`image_${numRound}_${numQuestion}`)

                setDropZone(dropZone, numRound, numQuestion)

                break
            }
          }
        )

        document.querySelector(`#type_${numRound}_${numQuestion}`).addEventListener('change', (
          event) => {
            change = document.querySelector(`#${event.target.id}`)
            question = change.parentElement
            round = question.parentElement
            pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].type = change.value
            
            info = event.target.id.split('_')
            numRound = info[1]
            numQuestion = info[2]

            content = document.querySelector(`#answer_type_${numRound}_${numQuestion}`)
            switch(change.value){
              case "simple":
                content.innerHTML = `<input id="answer_${numRound}_${numQuestion}" type="text">`

                pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer = ""

                document.querySelector(`#answer_${numRound}_${numQuestion}`).addEventListener('change', (
                  event) => {
                    change = document.querySelector(`#${event.target.id}`)
                    pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer = change.value
                  }
                )
                break
              case "test":
                content.innerHTML = `<input id="answer_${numRound}_${numQuestion}_0" type="text">
                <input id="answer_${numRound}_${numQuestion}_1" type="text">
                <input id="answer_${numRound}_${numQuestion}_2" type="text">
                <input id="answer_${numRound}_${numQuestion}_3" type="text">
                <p>Correct:</p>
                <select id="answer_${numRound}_${numQuestion}_4">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>`

                pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer = {0:"A", 1:"B", 2:"C", 3:"D", 4:1}

                document.querySelector(`#answer_${numRound}_${numQuestion}_0`).addEventListener('change', (
                  event) => {
                    change = document.querySelector(`#${event.target.id}`)
                    pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer[0] = change.value
                  }
                )
                document.querySelector(`#answer_${numRound}_${numQuestion}_1`).addEventListener('change', (
                  event) => {
                    change = document.querySelector(`#${event.target.id}`)
                    pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer[1] = change.value
                  }
                )
                document.querySelector(`#answer_${numRound}_${numQuestion}_2`).addEventListener('change', (
                  event) => {
                    change = document.querySelector(`#${event.target.id}`)
                    pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer[2] = change.value
                  }
                )
                document.querySelector(`#answer_${numRound}_${numQuestion}_3`).addEventListener('change', (
                  event) => {
                    change = document.querySelector(`#${event.target.id}`)
                    pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer[3] = change.value
                  }
                )
                document.querySelector(`#answer_${numRound}_${numQuestion}_4`).addEventListener('change', (
                  event) => {
                    change = document.querySelector(`#${event.target.id}`)
                    pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer[4] = change.value
                  }
                )
                break
              case "true":
                content.innerHTML = `<select id="answer_${numRound}_${numQuestion}_t">
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>`

                  pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer = "true"
                  
                  document.querySelector(`#answer_${numRound}_${numQuestion}_t`).addEventListener('change', (
                  event) => {
                    change = document.querySelector(`#${event.target.id}`)
                    pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer = change.value
                  }
                )
                break
            }
          }
        )

        document.querySelector(`#bonus_${numRound}_${numQuestion}`).addEventListener('change', (
          event) => {
            change = document.querySelector(`#${event.target.id}`)
            question = change.parentElement
            round = question.parentElement
            pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].bonus = change.value
          }
        )

        document.querySelector(`#question_${numRound}_${numQuestion}`).addEventListener('change', (
          event) => {
            change = document.querySelector(`#${event.target.id}`)
            question = change.parentElement.parentElement
            round = question.parentElement
            pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].question = change.value
          }
        )

        document.querySelector(`#answer_${numRound}_${numQuestion}`).addEventListener('change', (
          event) => {
            change = document.querySelector(`#${event.target.id}`)
            question = change.parentElement.parentElement.parentElement
            round = question.parentElement
            pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].answer = change.value
          }
        )
      }
    )
  }
)

document.querySelector('#packName').addEventListener('change', (
  event) => {
    packName = document.querySelector('#packName')

    valueToReplace = pack[Object.keys(pack)[0]]
    pack[packName.value] = valueToReplace
    delete pack[Object.keys(pack)[0]]
  }
)

document.querySelector('#download').addEventListener('click', (
  event) => {
    packName = document.querySelector('#packName')

    const jsonData = JSON.stringify(pack, null, 2);

    const blob = new Blob([jsonData], { type: 'application/json' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = packName.value + '.json';

    document.body.appendChild(a);
    a.click();

    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
)