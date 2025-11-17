function setDropZone(dropZone, numRound, numQuestion){
  dropZone.addEventListener("drop", (ev) => {
    ev.preventDefault();

    const files = [...ev.dataTransfer.items]
      .map((item) => item.getAsFile())
      .filter((file) => file);

    displayImages(files, numRound, numQuestion)
  });

  if (!dropZones.includes(dropZone)) {
    dropZones.push(dropZone)
  }

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    if ([...e.dataTransfer.items].some((item) => item.type.startsWith("image/"))) {
      e.dataTransfer.dropEffect = "copy";
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  })

  input = dropZone.querySelector(`input`)

  dropZone.addEventListener('click', function() {
    input.click();
  });

  input.addEventListener('change', function() {
    if (this.files.length > 0) {
      displayImages([this.files[0]], numRound, numQuestion);
    }
  });
}

function displayImages(files, numRound, numQuestion) {
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      text = document.getElementById(`imageText_${numRound}_${numQuestion}`)
      if (text) text.remove()

      const img = document.getElementById(`img_${numRound}_${numQuestion}`)
      img.src = URL.createObjectURL(file)

      const image = document.getElementById(`image_${numRound}_${numQuestion}`)

      const imgHeight = document.getElementById(`imageHeight_${numRound}_${numQuestion}`)
      if (imgHeight) imgHeight.remove()

      img.onload = function() {
        imgH = img.offsetHeight
        imgW = img.offsetWidth
        image.style.height = imgH
        image.style.width = imgW
      }

      imageFileToBase64(file, (base64Data) => {
        if (numRound == "p" && numQuestion == "p") {
          socket.emit('changeProfilePicture', {
            image: base64Data
          })
        }
      else pack[Object.keys(pack)[0]].rounds[round.getAttribute("name")].questions[question.getAttribute("name")].content = base64Data
      });
    }
  }
}

function dropHandler(ev) {
  ev.preventDefault();

  const files = [...ev.dataTransfer.items]
    .map((item) => item.getAsFile())
    .filter((file) => file);
  displayImages(files, numRound, numQuestion);
}

function imageFileToBase64(file, callback) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const base64String = event.target.result;
    callback(base64String);
  };
  reader.readAsDataURL(file);
}

window.addEventListener("drop", (e) => {e.preventDefault()})

dropZones = []

window.addEventListener("dragover", (e) => {
  e.preventDefault()
  if (!dropZones.includes(e.target)) {
    e.dataTransfer.dropEffect = "none";
  }
})