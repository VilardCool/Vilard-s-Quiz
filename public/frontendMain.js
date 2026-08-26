function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

let clientUuid = localStorage.getItem("CLIENT_UUID");

const socket = io()

if (!clientUuid) {
  socket.emit('giveUUID')
} else {
  socket.emit('connected', {
    uuid: clientUuid
  })
}

socket.on('alreadyInRoom', () => {
  // Visibility/positioning now live entirely in CSS (#pauseMenu shows
  // itself via :empty as soon as it has content) — no inline style needed.
  document.querySelector('#pauseMenu').textContent = "You already in game!"
})

socket.on('takeUUID', (uuid) => {
  localStorage.setItem("CLIENT_UUID", uuid)
  socket.emit('connected', {
    uuid: uuid
  })
})

socket.on('loadProfile', ({name, picture}) => {
  document.getElementById('profileName').value = name
  if (picture) document.getElementById('img_p_p').src = picture
})

socket.on('updateRooms', (backEndRooms) => {
  document.getElementById('roomContainer').innerHTML = ""

  for (const id in backEndRooms) {
    const backEndRoom = backEndRooms[id]

    var count = 0
    if (backEndRoom.judge) count += 1
    count += Object.keys(backEndRoom.players).length

    const safeName = escapeHtml(backEndRoom.name)
    document.getElementById('roomContainer')
      .innerHTML += `<a href="${encodeURIComponent(backEndRoom.name)}"><button data-id="${id}" class="question" style="margin-bottom: 1%; width: 95%">${safeName}: 
      ${count}</button></a>`
  }
})

let currentProposedFiles = []

document.querySelector('#host').addEventListener('click', (event) => {
  document.querySelector('#hostMenu').classList.add('open')
  socket.emit('requestProposedRoom')
})

document.querySelector('#hostMenuClose').addEventListener('click', (event) => {
  document.querySelector('#hostMenu').classList.remove('open')
})

// Attached once — always checks the latest list of proposed rooms,
// instead of re-attaching (and stacking up) a new listener on every open.
document.querySelector('#hostMenuRooms').addEventListener('click', (event) => {
  if (currentProposedFiles.includes(event.target.id)){
    document.querySelector(`#proposedRoom`).value = event.target.id
    document.querySelector(`#proposedHost`).click()
  }
})

socket.on('proposedRoomArray', (files) => {
  currentProposedFiles = files

  hostMenuRooms = document.querySelector('#hostMenuRooms')
  hostMenuHost = document.querySelector('#hostMenuHost')
  hostMenuSettings = document.querySelector('#hostMenuSettings')

  // Reset content on every open instead of appending, so reopening the
  // menu doesn't duplicate buttons/forms/fields.
  hostMenuRooms.innerHTML = ""
  hostMenuHost.innerHTML = ""
  hostMenuSettings.innerHTML = ""

  hostMenuHost.style = "margin-top: 75px;"
  hostMenuSettings.style = "margin-top: 75px;"

  for (file in files) {
    hostMenuRooms.innerHTML += `<button id="${escapeHtml(files[file])}" class="confirmButton true" style="height: 300px;">${escapeHtml(files[file])}</button>`
  }

  hostMenuSettings.innerHTML = `<div style="display: inline;">Autojudje:</div> <input type="checkbox" id="auto">
    <div style="display: inline; margin-left: 16px;">Answer time (sec):</div> <input type="number" id="answerTimeInput" class="form" style="width: 80px; display: inline-block;" value="20" min="5" max="120">`

  hostMenuHost.innerHTML = `<form action="/room" method="post" enctype="multipart/form-data" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <input id="autojudge" type="checkbox" style="display: none;">
      <input id="answerTime" name="answerTime" type="number" style="display: none;">
      <input id="room" name="room" type="text" class="form" placeholder="Room name" required>
      <input id="pack" name="pack" type="file" style="width: 100%;" required>
      <button id="hostSubmit" type="submit" class="confirmButton true">Host</button>
    </form>`

  document.querySelector('#auto').addEventListener('click', (event) => {
    document.querySelector('#autojudge').checked = document.querySelector('#auto').checked
    document.querySelector('#proposedAutojudge').checked = document.querySelector('#auto').checked
  })

  const syncAnswerTime = () => {
    const seconds = document.querySelector('#answerTimeInput').value
    document.querySelector('#answerTime').value = seconds
    document.querySelector('#proposedAnswerTime').value = seconds
  }
  syncAnswerTime()
  document.querySelector('#answerTimeInput').addEventListener('input', syncAnswerTime)
})