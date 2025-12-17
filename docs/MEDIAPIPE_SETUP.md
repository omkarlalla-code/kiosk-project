# MediaPipe Gesture Recognition Setup

## Overview

MediaPipe gesture recognition enables touchless interaction for the Greek Civilization Kiosk using hand gestures detected via webcam.

## 🎯 Architecture

```
Webcam → Browser → MediaPipe Tasks (JS) → Gesture Analysis → Kiosk Actions
```

**Technology**: MediaPipe Tasks for Web (JavaScript)
**Runs in**: Browser (no backend needed)
**Camera**: User's webcam via MediaDevices API

---

## ✅ What's Already Set Up

### 1. Gesture Recognition Module (`public/gesture-recognition.js`)
- Hand landmark detection
- Gesture analysis algorithms
- Debouncing and event handling
- Customizable gesture mappings

### 2. Gesture Demo Page (`public/gesture-demo.html`)
- Live camera preview
- Real-time gesture detection overlay
- Visual feedback for detected gestures
- Integration-ready architecture

### 3. Supported Gestures

| Gesture | Detection | Action | Use Case |
|---------|-----------|--------|----------|
| 👆 Point | Index finger extended | Select/Click | Choose image/option |
| ✋ Open Palm | All fingers extended | Stop/Pause | Pause narration |
| 👍 Thumbs Up | Thumb up, fingers closed | Next | Next image/topic |
| 👎 Thumbs Down | Thumb down | Previous | Go back |
| ✌️ Peace Sign | Index + middle extended | Volume Up | Increase audio |
| 🤘 Rock Sign | Index + pinky extended | Volume Down | Decrease audio |
| ✊ Fist | All fingers closed | Close/Exit | End session |
| 👋 Wave | Side-to-side motion | Start | Begin experience |

---

## 📦 Dependencies

### MediaPipe Tasks Vision (Loaded from CDN)

The gesture demo loads MediaPipe from CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js"></script>
```

**No npm installation needed** - works directly in browser!

### Browser Requirements

- **Camera Access**: Required
- **HTTPS or localhost**: MediaDevices API requires secure context
- **Modern Browser**:
  - Chrome/Edge 90+
  - Firefox 88+
  - Safari 14.1+

---

## 🚀 Quick Start

### 1. Ensure Demo Server is Running

```bash
# Check if server is running on port 8080
netstat -ano | findstr ":8080"

# If not running, check the demo server status
```

The demo server should serve files from `public/` directory.

### 2. Open Gesture Demo

Navigate to:
```
http://localhost:8080/gesture-demo.html
```

### 3. Grant Camera Permission

When prompted, click "Allow" to grant camera access.

### 4. Start Gesture Detection

1. Click **"▶️ Start Gesture Control"**
2. Camera preview will appear
3. Position your hand in front of the camera
4. Try gestures - they'll be logged in real-time

### 5. Test Gestures

Try these gestures in order:
- ✋ **Open palm** - All fingers extended
- 👆 **Point** - Only index finger up
- 👍 **Thumbs up** - Thumb extended upward
- ✌️ **Peace sign** - Index + middle finger

---

## 🔧 Integration with Main Kiosk

### Add Gesture Control to LiveKit Demo

Update `livekit-audio-demo.html`:

```html
<!-- Add camera preview -->
<div id="gesturePreview" style="position: fixed; bottom: 20px; right: 20px; width: 200px; height: 150px;">
  <video id="gestureCamera" autoplay playsinline></video>
  <canvas id="gestureCanvas"></canvas>
</div>

<!-- Include gesture recognition -->
<script src="/gesture-recognition.js"></script>

<script>
  // Initialize gesture recognition
  const gestureRecognizer = new GestureRecognizer();

  // Set up gestures when session starts
  async function enableGestures() {
    await gestureRecognizer.initialize('gestureCamera', 'gestureCanvas');
    gestureRecognizer.start();

    // Map gestures to kiosk actions
    gestureRecognizer.on('thumbs_up', () => {
      // Trigger next image
      showNextImage();
    });

    gestureRecognizer.on('open_palm', () => {
      // Pause narration
      window.speechSynthesis.pause();
    });

    gestureRecognizer.on('point', () => {
      // Click/select action
      console.log('Gesture: Point - Selecting');
    });
  }
</script>
```

---

## 🎨 Customizing Gestures

### Add New Gesture

In `gesture-recognition.js`:

```javascript
// Add to analyzeGesture() method
// Example: "OK" sign (thumb + index forming circle)
if (this.isOKSign(hand)) {
  return 'ok_sign';
}

// Add detection logic
isOKSign(hand) {
  const thumbTip = hand[4];
  const indexTip = hand[8];
  const distance = Math.sqrt(
    Math.pow(thumbTip.x - indexTip.x, 2) +
    Math.pow(thumbTip.y - indexTip.y, 2)
  );
  return distance < 0.05; // Threshold for "circle"
}

// Register handler
gestureRecognizer.on('ok_sign', () => {
  console.log('OK gesture detected');
  // Your action here
});
```

### Adjust Debounce Time

```javascript
// In GestureRecognizer constructor
this.gestureDebounceMs = 1500; // Wait 1.5s between gestures
```

### Change Gesture Sensitivity

```javascript
// In isFingerExtended()
isFingerExtended(hand, fingerTipIndex) {
  const tip = hand[fingerTipIndex];
  const base = hand[fingerTipIndex - 2];
  const threshold = 0.1; // Adjust sensitivity (0-1)
  return (base.y - tip.y) > threshold;
}
```

---

## 🐛 Troubleshooting

### Camera Not Working

**Issue**: "Camera access denied"
**Fix**:
1. Check browser permissions (chrome://settings/content/camera)
2. Ensure HTTPS or localhost
3. Restart browser after granting permission

### Gestures Not Detected

**Issue**: Gestures don't trigger actions
**Fix**:
1. Ensure good lighting
2. Keep hand within camera frame
3. Make clear, distinct gestures
4. Check console for errors
5. Try "Test Gesture" button first

### MediaPipe Script Not Loading

**Issue**: "MediaPipe is not defined"
**Fix**:
1. Check internet connection (CDN load)
2. Verify script tag in HTML
3. Check browser console for 404 errors
4. Try CDN alternative:
```html
<script src="https://cdn.skypack.dev/@mediapipe/tasks-vision"></script>
```

### Performance Issues

**Issue**: Slow/laggy gesture detection
**Fix**:
1. Reduce video resolution:
```javascript
video: {
  width: 320,  // Lower resolution
  height: 240,
  facingMode: 'user'
}
```

2. Increase detection interval:
```javascript
// Add delay between detections
setTimeout(() => this.detectGestures(), 100); // 10fps instead of 60fps
```

---

## 📊 Performance Metrics

### Expected Performance
- **Detection FPS**: 15-30 fps
- **Latency**: 50-100ms from gesture to action
- **CPU Usage**: 10-20% (one core)
- **Memory**: ~50MB

### Optimization Tips
1. Lower video resolution for slower devices
2. Reduce detection frequency
3. Disable gesture overlay when not debugging
4. Use gesture debouncing (already implemented)

---

## 🔒 Privacy & Security

### Camera Data
- **Processed locally** - No video sent to servers
- **No recording** - Frames analyzed in real-time only
- **User control** - Camera can be stopped anytime

### Best Practices
1. Show camera indicator when active
2. Provide easy stop/start controls
3. Clear privacy policy for users
4. Option to disable gesture control

---

## 📈 Advanced Features

### Multi-Hand Detection

```javascript
// Detect two hands simultaneously
if (landmarks.length === 2) {
  const leftHand = landmarks[0];
  const rightHand = landmarks[1];

  // Two-hand gesture: "Spread" (move hands apart)
  const distance = calculateDistance(leftHand[0], rightHand[0]);
  if (distance > 0.5) {
    return 'spread'; // Zoom in
  }
}
```

### Gesture Sequences

```javascript
// Detect gesture combinations
class GestureSequence {
  constructor() {
    this.history = [];
    this.sequenceTimeout = 2000;
  }

  add(gesture) {
    this.history.push({ gesture, time: Date.now() });
    this.checkSequences();
  }

  checkSequences() {
    // Check for: thumbs_up → point → open_palm
    if (this.matches(['thumbs_up', 'point', 'open_palm'])) {
      console.log('Secret sequence activated!');
    }
  }
}
```

### Gesture Training Mode

```javascript
// Record user's custom gestures
class GestureTrainer {
  recordGesture(name, landmarks) {
    this.customGestures[name] = landmarks;
    this.saveToLocalStorage();
  }

  recognizeCustom(currentLandmarks) {
    // Compare with stored gestures
    // Return best match
  }
}
```

---

## 🎯 Next Steps

### Immediate
1. ✅ Test gesture-demo.html
2. ✅ Verify camera access
3. ✅ Try all gestures

### Integration
1. Add gesture preview to main kiosk
2. Map gestures to image navigation
3. Add gesture tutorial for first-time users
4. Test in kiosk environment

### Enhancement
1. Add two-hand gestures
2. Implement gesture sequences
3. Add haptic feedback (vibration)
4. Create gesture analytics

---

## 📚 Resources

- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker/web_js)
- [Hand Landmarks Guide](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker#hand_landmark_model)
- [MediaDevices API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Gesture Recognition Patterns](https://www.interaction-design.org/literature/article/gesture-driven-interaction)

---

**Status**: ✅ Ready to use | Files created | Demo available at `/gesture-demo.html`
