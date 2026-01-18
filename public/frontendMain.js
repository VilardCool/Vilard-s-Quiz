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
  pause = document.querySelector('#pauseMenu')
  pause.style = "position: absolute; height: 98%; width: 98%; font-size: 40px; z-index:1; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;"
  pause.textContent = "You already in game!"
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

    document.getElementById('roomContainer')
      .innerHTML += `<a href=${backEndRoom.name}><button data-id="${id}" class="question" style="margin-bottom: 1%; width: 95%">${backEndRoom.name}: 
      ${count}</button></a>`
  }
})

document.querySelector('#host').addEventListener('click', (event) => {
  hostMenu = document.querySelector('#hostMenu')
  hostMenu.style = "position: absolute; height: 90%; width: 90%; font-size: 40px; z-index:1; background-color: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;"

  socket.emit('requestProposedRoom')
})

socket.on('proposedRoomArray', (files) => {
  hostMenuRooms = document.querySelector('#hostMenuRooms')
  hostMenuHost = document.querySelector('#hostMenuHost')
  hostMenuHost.style = "margin-top: 100px;"
  for (file in files) {
    hostMenuRooms.innerHTML += `<button id="${files[file]}" class="confirmButton true" style="height: 300px;">${files[file]}</button>`
  }
  hostMenuRooms.addEventListener('click', (event) => {
      if (files.includes(event.target.id)){
        document.querySelector(`#proposedRoom`).value = event.target.id
        document.querySelector(`#proposedHost`).click()
      }
    })
  hostMenuHost.innerHTML += `<form action="/room" method="post" enctype="multipart/form-data" style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
            <input id="room" name="room" type="text" class="form" placeholder="Room name" required>
            <input id="pack" name="pack" type="file" style="width: 100%;" required>
            <button id="host" type="submit" class="confirmButton true">Host</button>
          </form>`
})