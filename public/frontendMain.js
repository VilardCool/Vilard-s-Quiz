let clientUuid = localStorage.getItem("CLIENT_UUID");

const socket = io()

if (!clientUuid) {
  socket.emit('giveUUID')
} else {
  socket.emit('connected', {
    uuid: clientUuid
  }
)
}

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
