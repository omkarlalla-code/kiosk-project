/**
 * Mock TTS Service
 *
 * Responsibilities:
 * - Stream pre-recorded Opus chunks for testing
 * - Emit interleaved control messages (img_preload, img_show)
 * - Provide deterministic scripts with configurable timing
 * - Support jitter/loss simulation modes
 */

const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-tts' });
});

// WebSocket server for streaming
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  console.log('Client connected to mock TTS stream');

  // TODO: Implement streaming logic
  // - Send audio_frame messages with opus_base64 and playout_ts
  // - Send img_preload/img_show control messages
  // - Support configurable chunk rates and jitter modes

  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });
});

const server = app.listen(PORT, () => {
  console.log(`Mock TTS service listening on port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
