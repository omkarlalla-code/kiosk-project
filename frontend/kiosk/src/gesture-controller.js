/**
 * Gesture Controller
 * Handles MediaPipe hand tracking and gesture recognition
 */

export class GestureController {
  constructor(options) {
    this.videoElement = options.videoElement;
    this.onGesture = options.onGesture;

    this.hands = null;
    this.camera = null;
    this.lastGestureTime = 0;
    this.debounceMs = 500;
    this.enabled = false;
  }

  async init() {
    try {
      console.log('Initializing MediaPipe...');

      // TODO: Import and initialize MediaPipe Hands
      // const { Hands } = await import('@mediapipe/hands');
      // const { Camera } = await import('@mediapipe/camera_utils');

      // this.hands = new Hands({
      //   locateFile: (file) => {
      //     return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      //   }
      // });

      // this.hands.setOptions({
      //   maxNumHands: 1,
      //   modelComplexity: 0, // Use lightweight model for low-spec
      //   minDetectionConfidence: 0.5,
      //   minTrackingConfidence: 0.5
      // });

      // this.hands.onResults(this.onResults.bind(this));

      // Start camera
      // this.camera = new Camera(this.videoElement, {
      //   onFrame: async () => {
      //     await this.hands.send({ image: this.videoElement });
      //   },
      //   width: 480,
      //   height: 270,
      //   facingMode: 'user'
      // });

      // await this.camera.start();
      this.enabled = true;
      console.log('MediaPipe initialized');
    } catch (error) {
      console.error('Failed to initialize MediaPipe:', error);
    }
  }

  onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const gesture = this.recognizeGesture(landmarks);

    if (gesture) {
      this.emitGesture(gesture);
    }
  }

  recognizeGesture(landmarks) {
    // Simple gesture recognition based on hand landmarks
    // TODO: Implement actual gesture recognition logic

    // Example: Detect swipe left/right
    const wrist = landmarks[0];
    const indexTip = landmarks[8];

    // Swipe right (x increasing)
    if (indexTip.x > wrist.x + 0.2) {
      return { cmd: 'next', requiresServer: false };
    }

    // Swipe left (x decreasing)
    if (indexTip.x < wrist.x - 0.2) {
      return { cmd: 'prev', requiresServer: false };
    }

    // Fist (pause)
    const fingersClosed = this.areFingersClosed(landmarks);
    if (fingersClosed) {
      return { cmd: 'pause', requiresServer: false };
    }

    return null;
  }

  areFingersClosed(landmarks) {
    // Check if all fingers are closed (simple heuristic)
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const palm = landmarks[0];

    const avgDistance =
      (this.distance(thumbTip, palm) +
        this.distance(indexTip, palm) +
        this.distance(middleTip, palm) +
        this.distance(ringTip, palm) +
        this.distance(pinkyTip, palm)) /
      5;

    return avgDistance < 0.15;
  }

  distance(point1, point2) {
    return Math.sqrt(
      Math.pow(point1.x - point2.x, 2) +
        Math.pow(point1.y - point2.y, 2) +
        Math.pow(point1.z - point2.z, 2)
    );
  }

  emitGesture(gesture) {
    const now = performance.now();

    // Debounce gestures
    if (now - this.lastGestureTime < this.debounceMs) {
      return;
    }

    this.lastGestureTime = now;

    if (this.onGesture) {
      this.onGesture(gesture);
    }
  }

  enable() {
    if (!this.enabled) {
      this.init();
    }
  }

  disable() {
    if (this.camera) {
      this.camera.stop();
    }
    this.enabled = false;
  }
}
