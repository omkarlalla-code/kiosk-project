/**
 * Test client for Real TTS service
 * Usage: node test-client.js
 */

const WebSocket = require('ws');

const TTS_URL = 'ws://localhost:3002/ws';

console.log('🎤 Real TTS Service Test Client\n');

// Connect to TTS WebSocket
const ws = new WebSocket(TTS_URL);

let frameCount = 0;
let imageCount = 0;
let startTime = Date.now();

ws.on('open', () => {
  console.log('✅ Connected to Real TTS service\n');

  // Start streaming
  console.log('📤 Requesting TTS stream for Greek civilization...\n');
  ws.send(JSON.stringify({
    type: 'start_stream',
    topic: 'greek_civilization',
    session_id: 'test-session-001'
  }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'audio_frame':
        frameCount++;
        if (frameCount % 10 === 0) {
          process.stdout.write(`\r🔊 Audio frames: ${frameCount}`);
        }
        break;

      case 'img_preload':
        imageCount++;
        console.log(`\n📥 Preload image: ${message.id}`);
        console.log(`   URL: ${message.cdn_url}`);
        break;

      case 'img_show':
        console.log(`\n🖼️  Show image: ${message.id}`);
        console.log(`   Caption: ${message.caption}`);
        console.log(`   Transition: ${message.transition} (${message.duration_ms}ms)`);
        break;

      case 'end_of_stream':
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n\n✅ Stream completed!`);
        console.log(`   Total audio frames: ${frameCount}`);
        console.log(`   Total images: ${imageCount}`);
        console.log(`   Duration: ${duration}s`);
        console.log(`   Frame rate: ${(frameCount / duration).toFixed(1)} fps\n`);
        ws.close();
        break;

      case 'error':
        console.error(`\n❌ Error: ${message.message}`);
        ws.close();
        break;

      default:
        console.log(`\n❓ Unknown message type: ${message.type}`);
    }
  } catch (error) {
    console.error('\n❌ Failed to parse message:', error.message);
  }
});

ws.on('error', (error) => {
  console.error('\n❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n👋 Disconnected from TTS service\n');
  process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Stopping test client...');
  ws.close();
  process.exit(0);
});
