/**
 * Kiosk Client Main Entry Point
 */

import { LiveKitClient } from './livekit-client.js';
import { ImageScheduler } from './image-scheduler.js';
import { GestureController } from './gesture-controller.js';
import { PaymentUI } from './payment-ui.js';

class KioskApp {
  constructor() {
    this.livekit = null;
    this.imageScheduler = null;
    this.gestureController = null;
    this.paymentUI = null;
    this.sessionId = null;
  }

  async init() {
    console.log('Initializing Kiosk App...');

    // Initialize LiveKit client
    this.livekit = new LiveKitClient({
      orchestratorUrl: import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:3000',
      onAudioTrack: this.handleAudioTrack.bind(this),
      onDataMessage: this.handleDataMessage.bind(this),
      onConnectionStateChange: this.handleConnectionState.bind(this),
    });

    // Initialize image scheduler
    this.imageScheduler = new ImageScheduler({
      containerA: document.getElementById('image-buffer-a'),
      containerB: document.getElementById('image-buffer-b'),
      captionEl: document.getElementById('caption'),
      creditEl: document.getElementById('credit'),
    });

    // Initialize gesture controller
    this.gestureController = new GestureController({
      videoElement: document.getElementById('webcam'),
      onGesture: this.handleGesture.bind(this),
    });

    // Initialize payment UI
    this.paymentUI = new PaymentUI({
      modalEl: document.getElementById('payment-modal'),
      qrEl: document.getElementById('payment-qr'),
      amountEl: document.getElementById('payment-amount'),
      statusEl: document.getElementById('payment-status'),
    });

    // Connect to LiveKit
    await this.livekit.connect();

    console.log('Kiosk App initialized');
  }

  handleAudioTrack(track) {
    console.log('Received audio track');
    // Audio is automatically played by LiveKit client
    // Use audio context to get playout timing
    this.imageScheduler.setAudioContext(this.livekit.getAudioContext());
  }

  handleDataMessage(message) {
    console.log('Received data message:', message);

    switch (message.type) {
      case 'img_preload':
        this.imageScheduler.preload(message);
        break;
      case 'img_show':
        this.imageScheduler.scheduleShow(message);
        break;
      case 'payment_ready':
        this.paymentUI.showPayment(message);
        break;
      case 'payment_confirm':
        this.paymentUI.handleConfirmation(message);
        this.handlePaymentSuccess(message);
        break;
      case 'end_of_stream':
        console.log('Stream ended');
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  handleGesture(gesture) {
    console.log('Gesture detected:', gesture);

    // Local actions
    switch (gesture.cmd) {
      case 'next':
        this.imageScheduler.next();
        break;
      case 'prev':
        this.imageScheduler.prev();
        break;
      case 'pause':
        // Toggle pause
        break;
    }

    // Send to server if needed
    if (gesture.requiresServer) {
      this.livekit.sendDataMessage({
        type: 'gesture_cmd',
        cmd: gesture.cmd,
        session_id: this.sessionId,
        ts: performance.now(),
      });
    }
  }

  handleConnectionState(state) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = state;

    if (state === 'connected') {
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 2000);
    }
  }

  handlePaymentSuccess(message) {
    console.log('Payment successful:', message);
    // Unlock content or proceed with experience
  }
}

// Initialize app when DOM is ready
const app = new KioskApp();
app.init().catch(console.error);
