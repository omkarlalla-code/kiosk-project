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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received request:', data);

      if (data.type === 'start_stream') {
        startMockStream(ws, data);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from mock TTS stream');
  });
});

// Mock TTS streaming function
function startMockStream(ws, config = {}) {
  const {
    mode = 'normal',
    topic = 'greek_civilization',
    chunkDurationMs = 20,
    jitterMs = 0
  } = config;

  console.log(`Starting mock TTS stream: topic=${topic}, mode=${mode}`);

  const startTime = Date.now();
  let frameId = 0;
  let currentTime = 0;

  // Sample script with images
  const script = getMockScript(topic);

  // Stream audio frames and control messages
  const interval = setInterval(() => {
    if (frameId >= script.frames.length) {
      // End of stream
      ws.send(JSON.stringify({
        type: 'end_of_stream',
        session_id: config.session_id || 'mock-session'
      }));
      clearInterval(interval);
      console.log('Mock TTS stream completed');
      return;
    }

    const frame = script.frames[frameId];
    const playoutTs = startTime + currentTime;

    // Apply jitter if configured
    const jitter = mode === 'jitter' ? (Math.random() - 0.5) * jitterMs : 0;
    const delay = Math.max(0, jitter);

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        // Send audio frame
        if (frame.audio) {
          ws.send(JSON.stringify({
            type: 'audio_frame',
            frame_id: frameId,
            format: 'opus',
            data_base64: frame.audio,
            playout_ts: playoutTs
          }));
        }

        // Send control messages (img_preload, img_show)
        if (frame.controls) {
          frame.controls.forEach(control => {
            ws.send(JSON.stringify({
              ...control,
              playout_ts: playoutTs + (control.offset || 0)
            }));
          });
        }
      }
    }, delay);

    currentTime += chunkDurationMs;
    frameId++;
  }, chunkDurationMs);

  // Cleanup on disconnect
  ws.on('close', () => {
    clearInterval(interval);
  });
}

// Generate mock script based on topic
function getMockScript(topic) {
  // Mock Opus audio data (base64 encoded silence/noise)
  const mockOpusChunk = 'T2dnUwACAAAAAAAAAABqfL4kAAAAABGqfskBHgF2b3JiaXMAAAAAAUSsAAAAAAAAgDgBAAAAAAC4AU9nZ1MAAAAAAAAAAAAA';

  const scripts = {
    greek_civilization: {
      frames: [
        {
          audio: mockOpusChunk,
          controls: [
            {
              type: 'img_preload',
              id: 'parthenon_1',
              cdn_url: 'https://storage.googleapis.com/kiosk-images/parthenon.webp',
              ttl_ms: 10000,
              offset: 0
            }
          ]
        },
        { audio: mockOpusChunk },
        { audio: mockOpusChunk },
        {
          audio: mockOpusChunk,
          controls: [
            {
              type: 'img_show',
              id: 'parthenon_1',
              transition: 'crossfade',
              duration_ms: 400,
              caption: 'The Parthenon — Athens, 447 BC',
              credit: 'Photo: Test',
              offset: 0
            },
            {
              type: 'img_preload',
              id: 'acropolis_1',
              cdn_url: 'https://storage.googleapis.com/kiosk-images/acropolis.webp',
              ttl_ms: 10000,
              offset: 100
            }
          ]
        },
        { audio: mockOpusChunk },
        { audio: mockOpusChunk },
        { audio: mockOpusChunk },
        { audio: mockOpusChunk },
        {
          audio: mockOpusChunk,
          controls: [
            {
              type: 'img_show',
              id: 'acropolis_1',
              transition: 'crossfade',
              duration_ms: 400,
              caption: 'The Acropolis of Athens',
              credit: 'Photo: Test',
              offset: 0
            }
          ]
        },
        { audio: mockOpusChunk },
        { audio: mockOpusChunk }
      ]
    }
  };

  return scripts[topic] || scripts.greek_civilization;
}

const server = app.listen(PORT, () => {
  console.log(`Mock TTS service listening on port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
