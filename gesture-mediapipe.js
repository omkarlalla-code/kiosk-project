/**
 * MediaPipe Hand Tracking Integration
 * Loads MediaPipe Tasks Vision as ES module and provides hand landmark detection
 */

class MediaPipeHandTracker {
  constructor() {
    this.handLandmarker = null;
    this.isInitialized = false;
    this.videoElement = null;
    this.canvasElement = null;
    this.isRunning = false;
    this.onResultsCallback = null;
    this.animationFrameId = null;
  }

  /**
   * Initialize MediaPipe HandLandmarker
   */
  async initialize(videoElement, canvasElement) {
    try {
      console.log('🤚 Loading MediaPipe HandLandmarker...');

      this.videoElement = videoElement;
      this.canvasElement = canvasElement;

      // Dynamically import MediaPipe Tasks Vision
      const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js');

      const { HandLandmarker, FilesetResolver } = vision;

      // Load the MediaPipe WASM files
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      // Create HandLandmarker instance
      this.handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.isInitialized = true;
      console.log('✅ MediaPipe HandLandmarker initialized');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize MediaPipe:', error);
      throw error;
    }
  }

  /**
   * Start hand tracking loop
   */
  start(onResultsCallback) {
    if (!this.isInitialized) {
      throw new Error('MediaPipe not initialized. Call initialize() first.');
    }

    this.isRunning = true;
    this.onResultsCallback = onResultsCallback;
    console.log('▶️ Starting hand tracking...');

    this.detectHands();
  }

  /**
   * Stop hand tracking
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log('⏹️ Hand tracking stopped');
  }

  /**
   * Main detection loop
   */
  async detectHands() {
    if (!this.isRunning) return;

    const startTimeMs = performance.now();

    try {
      // Detect hand landmarks from video
      const results = await this.handLandmarker.detectForVideo(this.videoElement, startTimeMs);

      // Draw landmarks on canvas
      this.drawResults(results);

      // Call callback with results
      if (this.onResultsCallback && results.landmarks.length > 0) {
        this.onResultsCallback(results);
      }

    } catch (error) {
      console.error('Hand detection error:', error);
    }

    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.detectHands());
  }

  /**
   * Draw hand landmarks on canvas
   */
  drawResults(results) {
    const ctx = this.canvasElement.getContext('2d');
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw video frame
    ctx.save();
    ctx.scale(-1, 1); // Mirror for selfie view
    ctx.drawImage(this.videoElement, -width, 0, width, height);
    ctx.restore();

    // Draw hand landmarks
    if (results.landmarks) {
      for (const landmarks of results.landmarks) {
        this.drawLandmarks(ctx, landmarks, width, height);
        this.drawConnections(ctx, landmarks, width, height);
      }
    }
  }

  /**
   * Draw individual landmarks as circles
   */
  drawLandmarks(ctx, landmarks, width, height) {
    ctx.fillStyle = '#00FF00';
    ctx.strokeStyle = '#00FF00';

    for (const landmark of landmarks) {
      const x = landmark.x * width;
      const y = landmark.y * height;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  /**
   * Draw connections between landmarks
   */
  drawConnections(ctx, landmarks, width, height) {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;

    // Hand connections (simplified)
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],  // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],  // Index
      [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
      [0, 13], [13, 14], [14, 15], [15, 16],  // Ring
      [0, 17], [17, 18], [18, 19], [19, 20],  // Pinky
      [5, 9], [9, 13], [13, 17]  // Palm
    ];

    for (const [start, end] of connections) {
      const startLandmark = landmarks[start];
      const endLandmark = landmarks[end];

      ctx.beginPath();
      ctx.moveTo(startLandmark.x * width, startLandmark.y * height);
      ctx.lineTo(endLandmark.x * width, endLandmark.y * height);
      ctx.stroke();
    }
  }
}

// Export for use in main application
if (typeof window !== 'undefined') {
  window.MediaPipeHandTracker = MediaPipeHandTracker;
}
