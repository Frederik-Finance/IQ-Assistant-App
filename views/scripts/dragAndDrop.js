

let dropArea = document.getElementById('drop-area');
let submitBtn = document.getElementById('submit-btn');
let deleteBtn = document.getElementById('delete-btn');

dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

dropArea.addEventListener('drop', (e) => {
    checkAuthThenExecute(() => {
        e.preventDefault();
        e.stopPropagation();
        handleFiles(e.dataTransfer.files);
    });
});












function handleFiles(files) {
    if (files.length > 0) {
        let file = files[0];
        if (file.type.startsWith('image/')) {
            let reader = new FileReader();
            reader.onload = function (e) {
                let imageSource = e.target.result;
                displayImage(imageSource);
            }
            reader.readAsDataURL(file);
        }
    }
}


document.body.addEventListener('paste', (e) => {
    let clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) {
        return;
    }

    let items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            let blob = items[i].getAsFile();

            let URLObj = window.URL || window.webkitURL;
            let source = URLObj.createObjectURL(blob);

            displayImage(source);
        }
    }
});




deleteBtn.addEventListener('click', () => {
    dropArea.innerHTML = 'Drop or Paste screenshot';
    document.getElementById('answer').value = '';
});


const addScreenshotBtn = document.getElementById('add-text-btn');
const deleteLastBtn = document.getElementById('delete-last-btn');

let screenshots = []; // This array will act as the browser's folder to store screenshots

addScreenshotBtn.addEventListener('click', () => {
    // Get the current displayed image's source
    const displayedImage = dropArea.querySelector('img');
    if (displayedImage) {
        const currentScreenshotURL = displayedImage.src;
        screenshots.push(currentScreenshotURL);
    }
});



deleteLastBtn.addEventListener('click', () => {
    if (screenshots.length > 0) {
        screenshots.pop();
    }

    if (screenshots.length === 0) {
        dropArea.innerHTML = "Drop or Paste screenshot";
    } else {
        displayImage(screenshots[screenshots.length - 1]);
    }
});


submitBtn.addEventListener('click', () => {
    // Send screenshots to the server
    // For now, I'll just display an alert as a placeholder for the submission logic
    alert('Submitting...');
    console.log(screenshots); // Logging the array for visualization
    // Here, you'd typically use something like fetch() or XMLHttpRequest to send the screenshots to your server
});

function displayImage(source) {
    dropArea.innerHTML = `<img src="${source}" alt="Screenshot" class="max-w-full max-h-full">`;
    document.getElementById('answer').value = "Screenshot received!";
}

