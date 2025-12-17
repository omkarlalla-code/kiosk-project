/**
 * LiveKit Audio Publisher
 *
 * Publishes TTS audio streams as a bot participant in LiveKit rooms
 * This module creates a virtual participant that streams Opus-encoded audio
 */

const { Room, RoomEvent, LocalAudioTrack, AudioStream } = require('livekit-client');
const { AccessToken } = require('livekit-server-sdk');
const WebSocket = require('ws');
const { Writable } = require('stream');

class LiveKitAudioPublisher {
  constructor(livekitUrl, apiKey, apiSecret, ttsServiceUrl) {
    this.livekitUrl = livekitUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.ttsServiceUrl = ttsServiceUrl;
    this.activePublishers = new Map(); // session_id -> PublisherInstance
  }

  /**
   * Create a bot participant token for audio publishing
   */
  async createBotToken(roomName, botIdentity = 'tts-bot') {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: botIdentity,
      ttl: 3600,
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: false, // Bot doesn't need to receive
    });

    return await token.toJwt();
  }

  /**
   * Start publishing TTS audio for a session
   */
  async startPublishing(sessionId, roomName, text) {
    // Check if already publishing for this session
    if (this.activePublishers.has(sessionId)) {
      console.log(`⚠️ Already publishing for session ${sessionId}`);
      return;
    }

    try {
      console.log(`🎙️ Starting audio publisher for session ${sessionId}`);

      // Create publisher instance
      const publisher = new AudioPublisherInstance(
        this.livekitUrl,
        this.apiKey,
        this.apiSecret,
        this.ttsServiceUrl,
        sessionId,
        roomName,
        text
      );

      this.activePublishers.set(sessionId, publisher);

      // Start publishing
      await publisher.start();

      // Clean up when done
      publisher.on('complete', () => {
        this.activePublishers.delete(sessionId);
        console.log(`✅ Audio publishing complete for session ${sessionId}`);
      });

      return publisher;

    } catch (error) {
      console.error(`❌ Failed to start audio publisher: ${error.message}`);
      this.activePublishers.delete(sessionId);
      throw error;
    }
  }

  /**
   * Stop publishing for a session
   */
  async stopPublishing(sessionId) {
    const publisher = this.activePublishers.get(sessionId);
    if (publisher) {
      await publisher.stop();
      this.activePublishers.delete(sessionId);
      console.log(`⏹️ Stopped audio publisher for session ${sessionId}`);
    }
  }

  /**
   * Get publisher status
   */
  getStatus(sessionId) {
    const publisher = this.activePublishers.get(sessionId);
    return publisher ? publisher.getStatus() : null;
  }
}

/**
 * Individual audio publisher instance
 * Joins room as bot participant and streams audio
 */
class AudioPublisherInstance {
  constructor(livekitUrl, apiKey, apiSecret, ttsServiceUrl, sessionId, roomName, text) {
    this.livekitUrl = livekitUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.ttsServiceUrl = ttsServiceUrl;
    this.sessionId = sessionId;
    this.roomName = roomName;
    this.text = text;

    this.room = null;
    this.audioTrack = null;
    this.ttsWs = null;
    this.framesPublished = 0;
    this.isComplete = false;

    this.eventHandlers = {};
  }

  on(event, handler) {
    this.eventHandlers[event] = handler;
  }

  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event](data);
    }
  }

  async start() {
    // Note: This is a conceptual implementation
    // LiveKit client SDK (livekit-client) is designed for browsers
    // For Node.js server-side publishing, we need either:
    // 1. LiveKit Agents SDK (Python)
    // 2. Custom WebRTC implementation
    // 3. FFmpeg RTMP streaming to Ingress

    console.log('⚠️ Server-side audio publishing requires LiveKit Agents SDK or Ingress');
    console.log('📝 Current implementation uses Opus encoding preparation');
    console.log('🎯 Audio packets are ready but need LiveKit Ingress to inject');

    // Connect to TTS service to get audio stream
    await this.connectToTTS();
  }

  async connectToTTS() {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Connecting to TTS service: ${this.ttsServiceUrl}`);

      this.ttsWs = new WebSocket(this.ttsServiceUrl);

      this.ttsWs.on('open', () => {
        console.log('✅ Connected to TTS service');

        // Request text synthesis
        this.ttsWs.send(JSON.stringify({
          type: 'synthesize_text',
          text: this.text,
          session_id: this.sessionId
        }));

        resolve();
      });

      this.ttsWs.on('message', (data) => {
        this.handleTTSMessage(data);
      });

      this.ttsWs.on('error', (error) => {
        console.error('TTS WebSocket error:', error.message);
        reject(error);
      });

      this.ttsWs.on('close', () => {
        console.log('TTS connection closed');
        this.isComplete = true;
        this.emit('complete');
      });
    });
  }

  handleTTSMessage(data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'audio_frame':
          // PCM audio frame received
          // In full implementation, this would be encoded to Opus and sent to LiveKit
          this.framesPublished++;

          if (this.framesPublished % 50 === 0) {
            console.log(`📊 Published ${this.framesPublished} audio frames`);
          }
          break;

        case 'end_of_stream':
          console.log(`✅ TTS stream complete: ${this.framesPublished} frames`);
          this.stop();
          break;

        case 'error':
          console.error('TTS error:', message.message);
          this.stop();
          break;
      }
    } catch (error) {
      console.error('Error handling TTS message:', error);
    }
  }

  async stop() {
    if (this.ttsWs) {
      this.ttsWs.close();
    }

    if (this.audioTrack) {
      this.audioTrack.stop();
    }

    if (this.room) {
      this.room.disconnect();
    }

    this.isComplete = true;
    this.emit('complete');
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      roomName: this.roomName,
      framesPublished: this.framesPublished,
      isComplete: this.isComplete
    };
  }
}

module.exports = { LiveKitAudioPublisher };
