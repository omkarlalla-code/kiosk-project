/**
 * LiveKit Client Wrapper
 * Handles WebRTC connection, audio reception, and DataChannel messages
 */

import { Room, RoomEvent } from 'livekit-client';

export class LiveKitClient {
  constructor(options) {
    this.orchestratorUrl = options.orchestratorUrl;
    this.kioskId = options.kioskId || 'kiosk-001';
    this.onAudioTrack = options.onAudioTrack;
    this.onDataMessage = options.onDataMessage;
    this.onConnectionStateChange = options.onConnectionStateChange;

    this.room = null;
    this.audioContext = null;
    this.connected = false;
    this.sessionData = null;
  }

  async connect() {
    try {
      this.updateState('connecting');

      // Request token from orchestrator
      console.log('Requesting session from orchestrator...');
      this.sessionData = await this.requestToken();

      // Create LiveKit room
      this.room = new Room();

      // Setup event listeners
      this.room
        .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed.bind(this))
        .on(RoomEvent.DataReceived, this.handleDataReceived.bind(this))
        .on(RoomEvent.Disconnected, this.handleDisconnected.bind(this))
        .on(RoomEvent.Connected, () => {
          console.log('LiveKit room connected:', this.sessionData.room_name);
        });

      // Connect to LiveKit room
      console.log('Connecting to LiveKit:', this.sessionData.livekit_url);
      await this.room.connect(this.sessionData.livekit_url, this.sessionData.token);

      this.connected = true;
      this.updateState('connected');
      console.log('Connected to LiveKit successfully');
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      this.updateState('error');
      throw error;
    }
  }

  async requestToken() {
    const response = await fetch(`${this.orchestratorUrl}/start_session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kiosk_id: this.kioskId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Received session:', data.session_id);
    return data; // Return full session data including token, livekit_url, room_name
  }

  handleTrackSubscribed(track, publication, participant) {
    if (track.kind === 'audio') {
      // Attach audio track to HTML audio element
      const audioEl = track.attach();
      audioEl.play();

      // Create audio context for timing
      this.audioContext = new AudioContext();

      if (this.onAudioTrack) {
        this.onAudioTrack(track);
      }
    }
  }

  handleDataReceived(payload, participant) {
    const decoder = new TextDecoder();
    const messageStr = decoder.decode(payload);
    const message = JSON.parse(messageStr);

    if (this.onDataMessage) {
      this.onDataMessage(message);
    }
  }

  handleDisconnected() {
    this.connected = false;
    this.updateState('disconnected');
    console.log('Disconnected from LiveKit');
  }

  sendDataMessage(message) {
    if (!this.room || !this.connected) {
      console.warn('Cannot send message: not connected');
      return;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));
    this.room.localParticipant.publishData(data, { reliable: true });
  }

  getAudioContext() {
    return this.audioContext;
  }

  updateState(state) {
    if (this.onConnectionStateChange) {
      this.onConnectionStateChange(state);
    }
  }

  disconnect() {
    if (this.room) {
      this.room.disconnect();
    }
  }
}
