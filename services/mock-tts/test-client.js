/**
 * Test client for Mock TTS service
 * Usage: node test-client.js
 */

const WebSocket = require('ws');

const MOCK_TTS_URL = 'ws://localhost:3002';

console.log('Connecting to Mock TTS service...');

const ws = new WebSocket(MOCK_TTS_URL);

ws.on('open', () => {
  console.log('\u2705 Connected to Mock TTS');
  
  // Request to start streaming
  ws.send(JSON.stringify({
    type: 'start_stream',
    session_id: 'test-session',
    topic: 'greek_civilization',
    mode: 'normal'
  }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
      case 'audio_frame':
        const frameNum = message.frame_id + 1;
        console.log('\uD83D\uDD0A Audio frame ' + frameNum + ' at ' + message.playout_ts);
        break;
        
      case 'img_preload':
        console.log('\uD83D\uDCE5 Preload image: ' + message.id + ' from ' + message.cdn_url);
        break;
        
      case 'img_show':
        console.log('\uD83D\uDDBC\uFE0F  Show image: ' + message.id + ' - "' + message.caption + '"');
        break;
        
      case 'end_of_stream':
        console.log('\u2705 Stream ended');
        ws.close();
        break;
        
      default:
        console.log('Unknown message:', message);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('Disconnected from Mock TTS');
  process.exit(0);
});
