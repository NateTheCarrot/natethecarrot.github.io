window.addEventListener('DOMContentLoaded', () => {
    
    // tileSize will never change, but gridWidth will be set by the user (defaulting to 100)
    const tileSize = 64;
    let gridWidth = 100;

    // Tiles are loaded once used and stored to a cache later on
    const tileFolder = "./pibbles/";

    let tileDatabase = [];
    let mainImageFile = null;

    // Grab stuff from the main HTML document
    const mainInput = document.getElementById('mainImageInput');
    const generateButton = document.getElementById('generateButton');
    const downloadButton = document.getElementById('downloadButton');
    const copyButton = document.getElementById('copyButton');
    const statusText = document.getElementById('status');
    const progressBar = document.getElementById('progressBar');
    const canvas = document.getElementById('outputCanvas');
    const ctx = canvas.getContext('2d');
    const qualityRange = document.getElementById('qualityRange');

    // I learned about dialogs and modals and they're fun :D
    const modal = document.getElementById('creditsModal');

    document.getElementById('openCredits').onclick = () => modal.showModal();
    document.getElementById('closeCredits').onclick = () => modal.close();


    // This will check the maximum canvas dimension and canvas size (surface area?) allowed by the browser
    function getHardwareMaxCanvasDimension() {

        // Make a testing canvas separate from the actual one
        const testCanvas = document.createElement('canvas');
        const testCtx = testCanvas.getContext('2d');
        
        // Common sizes I chose to test
        const testSizes = [32768, 16384, 8192, 4096];

        // For each size, try to set the canvas height and width. Return the size if it works, otherwise continue to the next size
        for (let size of testSizes) {
            try {
                // 1:2 aspect ratio test, just a generic size
                testCanvas.width = Math.floor(size / 2);
                testCanvas.height = size;
                
                if (testCtx && testCanvas.height === size) {
                    testCtx.fillRect(0, 0, 1, 1);   
                    const pixel = testCtx.getImageData(0, 0, 1, 1).data;
                    if (pixel) return size;
                }
            } catch (e) {
                // It didn't work!
            }
        }
        return 4096;
    }

    // Based on the previous function, this function calculates grid width for pibbles
    function getMaxGridWidth(imgWidth, imgHeight) {

        // Get maximum dimensions and aspect ratio of the image
        const maxDimension = getHardwareMaxCanvasDimension();
        const aspect = imgHeight / imgWidth;

        // This 16k x 16k is usually the maximum amount of pixels for a canvas for browsers
        const maxTotalPixels = 16384 * 16384;

        // Based on tile size and max dimensioning, do some simple math to figure out maximum grid width and return the minimum number found to avoid issues with canvas not loading
        const maxByWidth = Math.floor(maxDimension / tileSize);
        const maxByHeight = Math.floor(maxDimension / (tileSize * aspect));
        const maxByArea = Math.floor(Math.sqrt(maxTotalPixels / (aspect * tileSize * tileSize)));

        return Math.min(maxByWidth, maxByHeight, maxByArea);
    }

    // When the user uploads an image, this function unlocks the quality range slider and the generate button
    mainInput.addEventListener('change', async (e) => {
        mainImageFile = e.target.files[0];
        
        if (mainImageFile) {
            const img = await loadImage(mainImageFile, true);
            
            const originalWidth = img.width;
            const originalHeight = img.height;


            generateButton.disabled = false;

            // Try to set the quality range slider to 100 if possible, otherwise browser max
            qualityRange.max = getMaxGridWidth(originalWidth, originalHeight);
            if(100 > qualityRange.max) {
                qualityRange.value = qualityRange.max;
            } else {
                qualityRange.value = 100;
            }
            document.getElementById('qualityValue').innerText = qualityRange.value;
            qualityRange.disabled = false;
        }
    });

    // Dynamically update the quality value whenever slider slides
    qualityRange.addEventListener('input', () => {
        document.getElementById('qualityValue').innerText = qualityRange.value;
    });

    // Downloads current canvas as a PNG file
    downloadButton.addEventListener('click', () => {
        downloadButton.textContent = 'Download started!';
        setTimeout(() => downloadButton.textContent = "Download Mosaic", 2000);
        const link = document.createElement('a');
        link.download = 'pibblification.png'; // File name
        link.href = canvas.toDataURL('image/png');
        link.click();
        
    });

    // Copies current canvas as a PNG to the clipboard
    copyButton.addEventListener('click', async () => {
        copyButton.textContent = 'Copying (large file!)...';
        try {

            // Convert canvas content to a PNG blob
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('Failed to copy image. Please try downloading instead.');
                    return;
                }

                // Put that pibblification into the clipboard
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                
                // Looks weird without feedback telling the user it was copied
                copyButton.textContent = 'Copied!';
                setTimeout(() => copyButton.textContent = "Copy to Clipboard", 2000);
            }, 'image/png');
        } catch (err) {
            console.error('Copy failed:', err);
            alert('Could not copy image to clipboard.');
        }
    });

    // Loads the RGB values associated with each image and puts it into the tileDatabase variable
    fetch('pibbles.json')
    .then(response => response.json())
    .then(data => {
        tileDatabase = data;
        mainInput.disabled = false;
    })
    .catch(err => {
        console.error(err);
    });
    
    // Loads the image!
    function loadImage(src, isFile = false) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous"; 
            img.onload = () => resolve(img);
            img.src = isFile ? URL.createObjectURL(src) : src;
        });
    }

    // Finds the closest tile match by comparing average pixel RGB value to the RGB values of each tile in the database
    function getClosestTileMatch(targetColor) {
        let bestTile = null;
        let bestDistance = Infinity;

        // For each tile, find the average color of the pixel and compare it to the tile's color. With that, get the distance from each color and return the best matching tile
        // I was thinking about using median color, but I've found mean looks better from afar
        for (const tile of tileDatabase) {
            const d = Math.sqrt(
                Math.pow(tile.rgb[0] - targetColor[0], 2) +
                Math.pow(tile.rgb[1] - targetColor[1], 2) +
                Math.pow(tile.rgb[2] - targetColor[2], 2)
            );
            
            if (d < bestDistance) {
                bestDistance = d;
                bestTile = tile;
            }
        }
        return bestTile;
    }

    
    // Begin the main program.............. when generate button is clicked
    generateButton.addEventListener('click', async () => {

        // Remove the previous image from the canvas to avoid issues
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        gridWidth = parseInt(qualityRange.value);
        generateButton.disabled = true;
        statusText.innerText = "Processing main image...";

        // Load image and get aspect ratio based off of grid width (and image dimensions)
        const mainImg = await loadImage(mainImageFile, true);
        const aspect = mainImg.height / mainImg.width;
        const gridHeight = Math.floor(gridWidth * aspect);

        // Makes a canvas that downscales the image so average pixel color can be found (based on respective sizing)
        const mainCanvas = document.createElement('canvas');
        mainCanvas.width = gridWidth;
        mainCanvas.height = gridHeight;
        const mainCtx = mainCanvas.getContext('2d');

        // This is where it downscales, then data is grabbed and stored in mainData to use later
        mainCtx.drawImage(mainImg, 0, 0, gridWidth, gridHeight);
        const mainData = mainCtx.getImageData(0, 0, gridWidth, gridHeight).data;

        // Back to the main (visible) canvas
        canvas.width = gridWidth * tileSize;
        canvas.height = gridHeight * tileSize;

        // Start of progress bar and status text
        statusText.innerText = "Pibblifying...";
        progressBar.style.display = "block";
        progressBar.max = gridHeight;

        // To use in the next loop, this stores already used images in this variable so they don't need to be loaded again. Not really needed right now because it's 64x64 images --
        // and not a lot, but if tile size was larger or there were more tiles, this kinda future-proofs it.
        const imgCache = {};

        // For each row in the image
        for (let y = 0; y < gridHeight; y++) {

            // Essentially, checks if the user is having issues with the program. If so, this slows down the program by making the drawing minimum priority which allows the browser to catch up
            if(document.getElementById('crashingChecbox').checked) { 
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            // For each pixel in the row
            for (let x = 0; x < gridWidth; x++) {

                // The image data is stored in a 1D array ([Red, Green, Blue, Alpha, Red, Green, Blue, Alpha, ...]) so this finds the index where the pixel starts and gets its RGB values
                const index = (y * gridWidth + x) * 4;

                const alpha = mainData[index + 3];

                // In the event the pixel is transparent, it will be skipped. Any values in-between will make the pibble more transparent
                if (alpha === 0) {
                    continue;
                }

                // Makes the current pibble being drawn onto the canvas match the original image's pixel alpha value
                ctx.globalAlpha = alpha / 255; 

                const targetColor = [mainData[index], mainData[index+1], mainData[index+2]];
                
                // Looks for the closest tile match based on average
                const match = getClosestTileMatch(targetColor);
                const imgUrl = tileFolder + match.name;

                // Stores the image in the cache if it wasn't used yet
                if (!imgCache[imgUrl]) {
                    imgCache[imgUrl] = await loadImage(imgUrl);
                }

                // Draws the pibble as a matching pixel/group of pixels on the original image
                ctx.drawImage(imgCache[imgUrl], x * tileSize, y * tileSize, tileSize, tileSize);

    

            }

            // Progress the progress bar
            progressBar.value = y + 1;
        }
        // Sets the alpha back (probably unnecessary, but just in case) for future canvases
        ctx.globalAlpha = 1.0;

        statusText.innerText = "Pibblification complete! Use the buttons above to download or copy the image.";
        progressBar.style.display = "none";
        generateButton.disabled = false;

        downloadButton.style.display = "inline-block";
        copyButton.style.display = "inline-block";
    });
})
