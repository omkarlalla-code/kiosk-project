/**
 * Test Opus transcoding pipeline
 * Creates a session and starts narration to test PCM→Opus encoding
 */

const axios = require('axios');

const ORCHESTRATOR_URL = 'http://localhost:3000';

async function testOpusPipeline() {
  console.log('🧪 Testing Opus Transcoding Pipeline\n');

  try {
    // Step 1: Create session
    console.log('1. Creating session...');
    const sessionResponse = await axios.post(`${ORCHESTRATOR_URL}/start_session`, {
      kiosk_id: 'kiosk-test-001'
    });

    const { session_id, room_name } = sessionResponse.data;
    console.log(`✅ Session created: ${session_id}`);
    console.log(`   Room: ${room_name}\n`);

    // Step 2: Start narration
    console.log('2. Starting narration...');
    const narrationResponse = await axios.post(`${ORCHESTRATOR_URL}/start_narration`, {
      session_id,
      topic: 'greek_civilization'
    });

    console.log(`✅ Narration started`);
    console.log(`   Check orchestrator logs for Opus encoding output\n`);

    // Wait for narration to complete
    console.log('⏳ Waiting for narration to complete (check logs)...');
    console.log('   Orchestrator should show:');
    console.log('   - "Connected to TTS service"');
    console.log('   - "Encoded frame X, Opus size: Y bytes"');
    console.log('   - "TTS stream completed: N frames encoded"\n');

    // Keep script running for a few seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('✅ Test complete! Check orchestrator and TTS logs for details.\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }

  process.exit(0);
}

testOpusPipeline();
