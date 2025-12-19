// Idle State - Screensaver with image slideshow

const imageEl = document.getElementById('screensaverImage');
const captionEl = document.getElementById('screensaverCaption');

// Screensaver image collection (mix of Greek civilization + system branding)
const screensaverImages = [
  // Greek civilization images
  { url: '../../../public/images/greek/parthenon_front.jpg', caption: 'The Parthenon - Athens, Greece' },
  { url: '../../../public/images/greek/theater_epidaurus.jpg', caption: 'Ancient Theater of Epidaurus' },
  { url: '../../../public/images/greek/temple_of_poseidon.jpg', caption: 'Temple of Poseidon - Cape Sounion' },
  { url: '../../../public/images/greek/delphi_overview.jpg', caption: 'Delphi - Center of the Ancient World' },
  { url: '../../../public/images/greek/olympia_stadium.jpg', caption: 'Olympic Stadium - Olympia' },
  { url: '../../../public/images/greek/erechtheion.jpg', caption: 'Erechtheion - Acropolis of Athens' },
  { url: '../../../public/images/greek/ancient_agora.jpg', caption: 'Ancient Agora of Athens' },
  { url: '../../../public/images/greek/temple_of_athena_nike.jpg', caption: 'Temple of Athena Nike' },

  // System branding/info screens
  { url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect fill="%23000" width="1920" height="1080"/><text x="50%" y="45%" fill="white" font-size="72" text-anchor="middle" font-family="Arial">🏛️ Greek Civilization</text><text x="50%" y="55%" fill="%23888" font-size="36" text-anchor="middle" font-family="Arial">Touch screen to begin</text></svg>', caption: 'Welcome to Greek Civilization Kiosk' },
  { url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect fill="%23000" width="1920" height="1080"/><text x="50%" y="40%" fill="white" font-size="64" text-anchor="middle" font-family="Arial">Explore Ancient Greece</text><text x="50%" y="50%" fill="%23aaa" font-size="32" text-anchor="middle" font-family="Arial">Interactive AI-Powered Experience</text><text x="50%" y="60%" fill="%23888" font-size="28" text-anchor="middle" font-family="Arial">Touch anywhere to start</text></svg>', caption: '' }
];

let currentIndex = 0;
let slideTimer = null;
const SLIDE_INTERVAL = 8000; // 8 seconds per image

function showImage(index) {
  const image = screensaverImages[index];

  // Fade out
  imageEl.classList.remove('visible');

  setTimeout(() => {
    // Load new image
    imageEl.src = image.url;
    captionEl.textContent = image.caption;

    // Fade in
    imageEl.onload = () => {
      imageEl.classList.add('visible');
    };
  }, 1000);
}

function nextSlide() {
  currentIndex = (currentIndex + 1) % screensaverImages.length;
  showImage(currentIndex);
}

function startSlideshow() {
  showImage(currentIndex);
  slideTimer = setInterval(nextSlide, SLIDE_INTERVAL);
}

function stopSlideshow() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

// Transition to payment on any click/touch
document.body.addEventListener('click', () => {
  stopSlideshow();
  window.kiosk.gotoPayment();
});

document.body.addEventListener('touchstart', () => {
  stopSlideshow();
  window.kiosk.gotoPayment();
});

// Start slideshow on load
startSlideshow();

console.log('[IDLE] Screensaver started');
