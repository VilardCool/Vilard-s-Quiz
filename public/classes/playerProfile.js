const dropZone = document.getElementById(`image_p_p`)

setDropZone(dropZone, "p", "p")

// Pack cover image dropzone — lives in #create (packCreator.js), wired here
// since this script loads after both packCreator.js and dropZone.js.
const packImageDropzone = document.getElementById(`image_pack_pack`)
if (packImageDropzone) setDropZone(packImageDropzone, "pack", "pack")

document.getElementById(`profileName`).addEventListener('change', (event) => {
    profileName = document.querySelector(`#${event.target.id}`).value
    socket.emit('changeProfileName', {
        name: profileName
    })    
})