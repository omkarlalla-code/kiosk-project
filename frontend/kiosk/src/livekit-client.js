/**
 * LiveKit Client Wrapper
 * Handles WebRTC connection, audio reception, and DataChannel messages
 */

export class LiveKitClient {
  constructor(options) {
    this.orchestratorUrl = options.orchestratorUrl;
    this.onAudioTrack = options.onAudioTrack;
    this.onDataMessage = options.onDataMessage;
    this.onConnectionStateChange = options.onConnectionStateChange;

    this.room = null;
    this.audioContext = null;
    this.connected = false;
  }

  async connect() {
    try {
      this.updateState('connecting');

      // TODO: Request token from orchestrator
      const token = await this.requestToken();

      // TODO: Import and use LiveKit SDK
      // const { Room } = await import('livekit-client');
      // this.room = new Room();

      // Setup event listeners
      // this.room.on('trackSubscribed', this.handleTrackSubscribed.bind(this));
      // this.room.on('dataReceived', this.handleDataReceived.bind(this));
      // this.room.on('disconnected', this.handleDisconnected.bind(this));

      // await this.room.connect(LIVEKIT_URL, token);

      this.connected = true;
      this.updateState('connected');
      console.log('Connected to LiveKit');
    } catch (error) {
      console.error('Failed to connect:', error);
      this.updateState('error');
      throw error;
    }
  }

  async requestToken() {
    const response = await fetch(`${this.orchestratorUrl}/start_session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kiosk_id: 'kiosk-001' }),
    });

    if (!response.ok) {
      throw new Error('Failed to get token');
    }

    const data = await response.json();
    return data.token;
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
