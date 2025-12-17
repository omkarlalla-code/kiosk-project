/**
 * FFmpeg Audio Streamer for LiveKit Ingress
 *
 * Streams TTS audio to LiveKit via RTMP Ingress
 * Requires: FFmpeg installed, LiveKit Ingress enabled
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const { IngressClient, IngressAudioOptions, IngressInput } = require('livekit-server-sdk');

class FFmpegAudioStreamer {
  constructor(livekitUrl, apiKey, apiSecret, ttsServiceUrl) {
    this.livekitUrl = livekitUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.ttsServiceUrl = ttsServiceUrl;
    this.ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
    this.activeStreams = new Map();
  }

  /**
   * Create RTMP Ingress endpoint for audio streaming
   */
  async createIngress(roomName, participantName = 'tts-bot') {
    try {
      console.log(`Creating RTMP Ingress for room: ${roomName}`);

      const ingress = await this.ingressClient.createIngress(
        IngressInput.RTMP_INPUT,
        {
          name: `tts-audio-${roomName}`,
          roomName: roomName,
          participantIdentity: participantName,
          participantName: participantName,
          audio: new IngressAudioOptions({
            source: 'AUDIO_OPUS', // or 'AUDIO_AAC'
          }),
        }
      );

      console.log(`✅ Ingress created: ${ingress.ingressId}`);
      console.log(`📡 RTMP URL: ${ingress.url}`);
      console.log(`🔑 Stream Key: ${ingress.streamKey}`);

      return {
        ingressId: ingress.ingressId,
        rtmpUrl: ingress.url,
        streamKey: ingress.streamKey,
      };
    } catch (error) {
      console.error(`❌ Failed to create Ingress: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stream TTS audio via FFmpeg to RTMP Ingress
   */
  async startStreaming(sessionId, roomName, text) {
    if (this.activeStreams.has(sessionId)) {
      console.log(`⚠️ Stream already active for session ${sessionId}`);
      return;
    }

    try {
      // Create Ingress
      const ingress = await this.createIngress(roomName);

      // Connect to TTS service
      const ttsWs = new WebSocket(this.ttsServiceUrl);

      // Set up FFmpeg process
      const ffmpegProcess = this.createFFmpegProcess(ingress);

      const streamState = {
        sessionId,
        roomName,
        ingress,
        ttsWs,
        ffmpegProcess,
        framesReceived: 0,
        isActive: true,
      };

      this.activeStreams.set(sessionId, streamState);

      // Set up TTS connection
      await this.connectTTSToFFmpeg(streamState, text);

      return streamState;
    } catch (error) {
      console.error(`❌ Failed to start streaming: ${error.message}`);
      this.activeStreams.delete(sessionId);
      throw error;
    }
  }

  /**
   * Create FFmpeg process to stream PCM audio to RTMP
   */
  createFFmpegProcess(ingress) {
    const rtmpUrl = `${ingress.rtmpUrl}/${ingress.streamKey}`;

    console.log(`🎬 Starting FFmpeg stream to: ${rtmpUrl}`);

    // FFmpeg command to convert PCM to RTMP stream
    const ffmpeg = spawn('ffmpeg', [
      '-f', 's16le',              // Input format: signed 16-bit little-endian PCM
      '-ar', '48000',             // Sample rate: 48kHz
      '-ac', '1',                 // Channels: mono
      '-i', 'pipe:0',             // Input from stdin (pipe)
      '-c:a', 'libopus',          // Encode to Opus
      '-b:a', '64k',              // Bitrate: 64kbps
      '-f', 'flv',                // Output format: FLV (for RTMP)
      rtmpUrl                     // Output to RTMP URL
    ]);

    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg outputs to stderr for status
      const message = data.toString();
      if (message.includes('error') || message.includes('Error')) {
        console.error('FFmpeg error:', message);
      }
    });

    ffmpeg.on('error', (error) => {
      console.error('FFmpeg process error:', error.message);
    });

    ffmpeg.on('exit', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
    });

    return ffmpeg;
  }

  /**
   * Connect TTS WebSocket and pipe audio to FFmpeg
   */
  async connectTTSToFFmpeg(streamState, text) {
    return new Promise((resolve, reject) => {
      const { ttsWs, ffmpegProcess, sessionId } = streamState;

      ttsWs.on('open', () => {
        console.log('✅ Connected to TTS service');

        // Request text synthesis
        ttsWs.send(JSON.stringify({
          type: 'synthesize_text',
          text: text,
          session_id: sessionId,
        }));

        resolve();
      });

      ttsWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          switch (message.type) {
            case 'audio_frame':
              // Decode PCM from base64
              const pcmData = Buffer.from(message.data_base64, 'base64');

              // Write to FFmpeg stdin
              if (ffmpegProcess.stdin.writable) {
                ffmpegProcess.stdin.write(pcmData);
                streamState.framesReceived++;
              }
              break;

            case 'end_of_stream':
              console.log(`✅ TTS complete: ${streamState.framesReceived} frames`);
              this.stopStreaming(sessionId);
              break;

            case 'error':
              console.error('TTS error:', message.message);
              this.stopStreaming(sessionId);
              break;
          }
        } catch (error) {
          console.error('Error processing TTS message:', error);
        }
      });

      ttsWs.on('error', (error) => {
        console.error('TTS WebSocket error:', error.message);
        reject(error);
      });

      ttsWs.on('close', () => {
        console.log('TTS connection closed');
        this.stopStreaming(sessionId);
      });
    });
  }

  /**
   * Stop streaming for a session
   */
  async stopStreaming(sessionId) {
    const streamState = this.activeStreams.get(sessionId);
    if (!streamState) return;

    console.log(`⏹️ Stopping stream for session ${sessionId}`);

    streamState.isActive = false;

    // Close TTS WebSocket
    if (streamState.ttsWs) {
      streamState.ttsWs.close();
    }

    // Close FFmpeg stdin and terminate
    if (streamState.ffmpegProcess) {
      if (streamState.ffmpegProcess.stdin.writable) {
        streamState.ffmpegProcess.stdin.end();
      }
      streamState.ffmpegProcess.kill();
    }

    // Delete Ingress (optional - can be reused)
    try {
      await this.ingressClient.deleteIngress(streamState.ingress.ingressId);
      console.log(`✅ Deleted Ingress: ${streamState.ingress.ingressId}`);
    } catch (error) {
      console.error('Error deleting Ingress:', error.message);
    }

    this.activeStreams.delete(sessionId);
  }

  /**
   * Get stream status
   */
  getStatus(sessionId) {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) return null;

    return {
      sessionId: stream.sessionId,
      roomName: stream.roomName,
      framesReceived: stream.framesReceived,
      isActive: stream.isActive,
      ingressId: stream.ingress.ingressId,
    };
  }

  /**
   * Check if FFmpeg is installed
   */
  static async checkFFmpeg() {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);

      ffmpeg.on('error', () => {
        resolve(false);
      });

      ffmpeg.on('exit', (code) => {
        resolve(code === 0);
      });
    });
  }
}

module.exports = { FFmpegAudioStreamer };
