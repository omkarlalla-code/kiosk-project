/**
 * TensorFlow.js Handpose Integration
 * Simpler and more reliable than MediaPipe for browser usage
 */

class HandposeTracker {
  constructor() {
    this.model = null;
    this.isInitialized = false;
    this.videoElement = null;
    this.canvasElement = null;
    this.isRunning = false;
    this.onResultsCallback = null;
    this.animationFrameId = null;
  }

  /**
   * Initialize Handpose model
   */
  async initialize(videoElement, canvasElement) {
    try {
      console.log('🤚 Loading TensorFlow.js Handpose...');

      this.videoElement = videoElement;
      this.canvasElement = canvasElement;

      // Load handpose model from CDN
      // Using script tags loaded in HTML
      if (typeof handpose === 'undefined') {
        throw new Error('Handpose library not loaded. Include TensorFlow.js and Handpose scripts.');
      }

      // Load the model
      this.model = await handpose.load();

      this.isInitialized = true;
      console.log('✅ Handpose model loaded successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize Handpose:', error);
      throw error;
    }
  }

  /**
   * Start hand tracking loop
   */
  start(onResultsCallback) {
    if (!this.isInitialized) {
      throw new Error('Handpose not initialized. Call initialize() first.');
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

    try {
      // Estimate hand keypoints
      const predictions = await this.model.estimateHands(this.videoElement);

      // Draw results on canvas
      this.drawResults(predictions);

      // Call callback with results
      if (this.onResultsCallback && predictions.length > 0) {
        // Convert handpose format to MediaPipe-like format
        const results = {
          landmarks: predictions.map(p => p.landmarks)
        };
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
  drawResults(predictions) {
    const ctx = this.canvasElement.getContext('2d');
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw video frame (mirrored)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(this.videoElement, -width, 0, width, height);
    ctx.restore();

    // Draw hand landmarks
    if (predictions.length > 0) {
      for (const prediction of predictions) {
        this.drawKeypoints(ctx, prediction.landmarks);
        this.drawSkeleton(ctx, prediction.landmarks);
      }
    }
  }

  /**
   * Draw keypoints as circles
   */
  drawKeypoints(ctx, landmarks) {
    ctx.fillStyle = '#00FF00';

    for (const [x, y] of landmarks) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  /**
   * Draw skeleton connections
   */
  drawSkeleton(ctx, landmarks) {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;

    // Hand connections (simplified - connecting adjacent fingers)
    const fingerConnections = [
      [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],     // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Palm
    ];

    for (const [i, j] of fingerConnections) {
      const [x1, y1] = landmarks[i];
      const [x2, y2] = landmarks[j];

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
}

// Export for use in main application
if (typeof window !== 'undefined') {
  window.HandposeTracker = HandposeTracker;
}
