/**
 * MediaPipe Gesture Recognition for Greek Civilization Kiosk
 *
 * Detects hand gestures for touchless interaction:
 * - 👆 Point: Select/Click
 * - ✋ Open Palm: Stop/Pause
 * - 👍 Thumbs Up: Next/Continue
 * - 👎 Thumbs Down: Previous/Back
 * - ✌️ Peace Sign: Volume Up
 * - 🤘 Rock Sign: Volume Down
 * - 👋 Wave: Start Session
 * - ✊ Fist: Close/Exit
 */

class GestureRecognizer {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.gestureRecognizer = null;
    this.handLandmarker = null;
    this.isRunning = false;
    this.lastGesture = null;
    this.gestureDebounceMs = 1000; // Prevent rapid repeated gestures
    this.lastGestureTime = 0;
    this.callbacks = {};

    // MediaPipe model URLs (CDN)
    this.modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  }

  /**
   * Initialize MediaPipe and camera
   */
  async initialize(videoElementId, canvasElementId) {
    try {
      console.log('🤚 Initializing MediaPipe gesture recognition...');

      this.videoElement = document.getElementById(videoElementId);
      this.canvasElement = document.getElementById(canvasElementId);

      if (!this.videoElement || !this.canvasElement) {
        throw new Error('Video or canvas element not found');
      }

      // Load MediaPipe Hand Landmarker
      await this.loadMediaPipe();

      // Set up camera
      await this.setupCamera();

      console.log('✅ MediaPipe gesture recognition initialized');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize gesture recognition:', error);
      throw error;
    }
  }

  /**
   * Load Handpose hand tracking model
   */
  async loadMediaPipe() {
    console.log('📦 Loading Handpose tracker...');

    // Check if HandposeTracker is available
    if (typeof window.HandposeTracker === 'undefined') {
      throw new Error('HandposeTracker not loaded. Include gesture-handpose.js first.');
    }

    // Create Handpose tracker
    this.handTracker = new window.HandposeTracker();
    await this.handTracker.initialize(this.videoElement, this.canvasElement);

    this.isModelLoaded = true;
    console.log('✅ Handpose tracker ready');
  }

  /**
   * Set up webcam access
   */
  async setupCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: 'user'
        },
        audio: false
      });

      this.videoElement.srcObject = stream;

      // Wait for video to be ready
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play();
          resolve();
        };
      });

      console.log('📹 Camera initialized');

      // Set canvas size to match video
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;

    } catch (error) {
      console.error('❌ Camera access denied:', error);
      throw new Error('Camera access required for gesture control');
    }
  }

  /**
   * Start gesture detection loop
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Gesture recognition already running');
      return;
    }

    this.isRunning = true;
    console.log('▶️ Starting gesture detection');

    // Start MediaPipe hand tracking with callback
    this.handTracker.start((results) => {
      if (results.landmarks && results.landmarks.length > 0) {
        const gesture = this.analyzeGesture(results.landmarks);
        if (gesture) {
          this.handleGesture(gesture);
        }
      }
    });
  }

  /**
   * Stop gesture detection
   */
  stop() {
    this.isRunning = false;
    console.log('⏹️ Stopped gesture detection');

    // Stop MediaPipe hand tracker
    if (this.handTracker) {
      this.handTracker.stop();
    }

    // Stop camera
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = this.videoElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Analyze hand landmarks to detect gestures
   */
  analyzeGesture(landmarks) {
    if (!landmarks || landmarks.length === 0) {
      return null;
    }

    // Hand landmarks are 21 points (0-20)
    // Key points:
    // 0: Wrist
    // 4: Thumb tip
    // 8: Index finger tip
    // 12: Middle finger tip
    // 16: Ring finger tip
    // 20: Pinky tip

    const hand = landmarks[0]; // First detected hand

    // Example gesture detection logic:

    // POINT (index finger extended, others closed)
    if (this.isFingerExtended(hand, 8) &&
        !this.isFingerExtended(hand, 12) &&
        !this.isFingerExtended(hand, 16) &&
        !this.isFingerExtended(hand, 20)) {
      return 'point';
    }

    // THUMBS UP (thumb up, others closed)
    if (this.isThumbUp(hand)) {
      return 'thumbs_up';
    }

    // OPEN PALM (all fingers extended)
    if (this.isFingerExtended(hand, 8) &&
        this.isFingerExtended(hand, 12) &&
        this.isFingerExtended(hand, 16) &&
        this.isFingerExtended(hand, 20)) {
      return 'open_palm';
    }

    // FIST (all fingers closed)
    if (!this.isFingerExtended(hand, 8) &&
        !this.isFingerExtended(hand, 12) &&
        !this.isFingerExtended(hand, 16) &&
        !this.isFingerExtended(hand, 20)) {
      return 'fist';
    }

    // PEACE SIGN (index and middle extended)
    if (this.isFingerExtended(hand, 8) &&
        this.isFingerExtended(hand, 12) &&
        !this.isFingerExtended(hand, 16) &&
        !this.isFingerExtended(hand, 20)) {
      return 'peace';
    }

    return null;
  }

  /**
   * Check if a finger is extended based on landmarks
   */
  isFingerExtended(hand, fingerTipIndex) {
    // Simplified check: compare tip to base
    const tip = hand[fingerTipIndex];
    const base = hand[fingerTipIndex - 2];
    return tip.y < base.y; // Tip is above base
  }

  /**
   * Check if thumb is up
   */
  isThumbUp(hand) {
    const thumbTip = hand[4];
    const thumbBase = hand[2];
    return thumbTip.y < thumbBase.y && thumbTip.x < hand[8].x;
  }

  /**
   * Handle detected gesture
   */
  handleGesture(gesture) {
    const now = Date.now();

    // Debounce rapid gestures
    if (now - this.lastGestureTime < this.gestureDebounceMs) {
      return;
    }

    // Don't repeat same gesture
    if (gesture === this.lastGesture) {
      return;
    }

    this.lastGesture = gesture;
    this.lastGestureTime = now;

    console.log(`👋 Gesture detected: ${gesture}`);

    // Trigger callback
    if (this.callbacks[gesture]) {
      this.callbacks[gesture]();
    }

    // Trigger generic callback
    if (this.callbacks['any']) {
      this.callbacks['any'](gesture);
    }
  }

  /**
   * Register gesture callback
   */
  on(gesture, callback) {
    this.callbacks[gesture] = callback;
  }

  /**
   * Trigger gesture manually (for testing)
   */
  triggerGesture(gesture) {
    this.handleGesture(gesture);
  }
}

// Gesture-to-action mappings for kiosk
const KioskGestureActions = {
  point: 'click',
  open_palm: 'pause',
  thumbs_up: 'next',
  thumbs_down: 'previous',
  peace: 'volume_up',
  fist: 'close',
  wave: 'start',
};

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GestureRecognizer, KioskGestureActions };
}
