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
  const packButton = event.target.closest('button')
  if (!packButton) return
  if (currentProposedFiles.includes(packButton.id)){
    document.querySelector(`#proposedRoom`).value = packButton.id
    document.querySelector(`#proposedHost`).click()
  }
})

socket.on('proposedRoomArray', (packs) => {
  currentProposedFiles = packs.map((pack) => pack.name)

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

  for (const pack of packs) {
    const thumb = pack.image
      ? `<img src="${escapeHtml(pack.image)}" class="packPickerThumb" alt="">`
      : ''
    hostMenuRooms.innerHTML += `<button id="${escapeHtml(pack.name)}" class="confirmButton true packPickerButton">
      ${thumb}<span>${escapeHtml(pack.name)}</span>
    </button>`
  }

  hostMenuSettings.innerHTML = `<div style="display: inline;">Autojudje:</div> <input type="checkbox" id="auto">
    <div style="display: inline; margin-left: 16px;">Buzz-in time (sec):</div> <input type="number" id="buzzTimeInput" class="form" style="width: 80px; display: inline-block;" value="5" min="2" max="60">
    <div style="display: inline; margin-left: 16px;">Answer time (sec):</div> <input type="number" id="answerTimeInput" class="form" style="width: 80px; display: inline-block;" value="20" min="5" max="120">
    <div style="display: inline; margin-left: 16px;">Reveal time (sec):</div> <input type="number" id="revealTimeInput" class="form" style="width: 80px; display: inline-block;" value="3" min="1" max="30">`

  hostMenuHost.innerHTML = `<form action="/room" method="post" enctype="multipart/form-data" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <input id="autojudge" type="checkbox" style="display: none;">
      <input id="answerTime" name="answerTime" type="number" style="display: none;">
      <input id="buzzTime" name="buzzTime" type="number" style="display: none;">
      <input id="revealTime" name="revealTime" type="number" style="display: none;">
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

  const syncBuzzTime = () => {
    const seconds = document.querySelector('#buzzTimeInput').value
    document.querySelector('#buzzTime').value = seconds
    document.querySelector('#proposedBuzzTime').value = seconds
  }
  syncBuzzTime()
  document.querySelector('#buzzTimeInput').addEventListener('input', syncBuzzTime)

  const syncRevealTime = () => {
    const seconds = document.querySelector('#revealTimeInput').value
    document.querySelector('#revealTime').value = seconds
    document.querySelector('#proposedRevealTime').value = seconds
  }
  syncRevealTime()
  document.querySelector('#revealTimeInput').addEventListener('input', syncRevealTime)
})