const dropZone = document.getElementById(`image_p_p`)

setDropZone(dropZone, "p", "p")

document.getElementById(`profileName`).addEventListener('change', (event) => {
    profileName = document.querySelector(`#${event.target.id}`).value
    socket.emit('changeProfileName', {
        name: profileName
    })    
})