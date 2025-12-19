require('dotenv').config();
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { createClient } = require('@deepgram/sdk');

const PORT = process.env.PORT || 3004;

const server = createServer();
const wss = new WebSocketServer({ server });

console.log('STT Service starting...');

wss.on('connection', (ws) => {
  console.log('Client connected to STT service');

  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

  console.log('🔑 Deepgram API Key:', process.env.DEEPGRAM_API_KEY ? process.env.DEEPGRAM_API_KEY.substring(0, 10) + '...' : 'NOT SET');

  const deepgramConnection = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    punctuate: true,
    smart_format: true,
    interim_results: true,
    endpointing: 500,
    utterance_end_ms: 1000,
    vad_events: true,
    encoding: 'linear16',
    sample_rate: 48000,
    channels: 1
  });

  let keepAliveInterval;

  deepgramConnection.on('open', () => {
    console.log('✅ Connected to Deepgram - Ready to receive audio');

    // Send keepalive every 5 seconds to prevent timeout
    keepAliveInterval = setInterval(() => {
      if (deepgramConnection.getReadyState() === 1) {
        deepgramConnection.keepAlive();
        console.log('💓 Keepalive sent to Deepgram');
      }
    }, 5000);

    deepgramConnection.on('transcript', (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;

      if (transcript && transcript.trim().length > 0) {
        const is_final = data.is_final || data.speech_final;

        if (is_final) {
          console.log(`✅ Final transcript: "${transcript}"`);

          // Send transcript back to frontend
          ws.send(JSON.stringify({
            type: 'transcript',
            transcript: transcript,
            is_final: true
          }));

          // Forward to orchestrator for LLM processing
          fetch('http://localhost:3000/converse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: ws.sessionId || 'stt-test-session',
              message: transcript,
            }),
          }).catch(error => {
            console.error('Error forwarding transcript to orchestrator:', error);
          });
        } else {
          // Send interim results to frontend
          console.log(`⏳ Interim: "${transcript}"`);
          ws.send(JSON.stringify({
            type: 'transcript',
            transcript: transcript,
            is_final: false
          }));
        }
      }
    });

    deepgramConnection.on('close', (closeEvent) => {
      console.log('❌ Deepgram connection closed:', closeEvent);
    });

    deepgramConnection.on('error', (error) => {
      console.error('❌ Deepgram error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', message: error.message || 'Deepgram error' }));
      }
    });

    deepgramConnection.on('warning', (warning) => {
      console.warn('⚠️ Deepgram warning:', warning);
    });

    deepgramConnection.on('metadata', (metadata) => {
      console.log('📊 Deepgram metadata:', metadata);
    });

    let audioChunkCount = 0;
    let lastLogTime = Date.now();

    ws.on('message', (data) => {
      // The first message from the client should be a JSON string with the session_id
      // Subsequent messages will be raw audio buffers.
      try {
        const message = JSON.parse(data);
        if (message.type === 'session_id' && message.id) {
          // Associate the session ID with this WebSocket connection
          ws.sessionId = message.id;
          console.log(`✅ Associated STT connection with session: ${ws.sessionId}`);
          return; // Do not forward this metadata to Deepgram
        }
      } catch (e) {
        // This is expected to fail for audio buffers, so we'll just continue.
      }

      // Forward audio from client to Deepgram
      if (deepgramConnection.getReadyState() === 1) {
        deepgramConnection.send(data);
        audioChunkCount++;

        // Log audio reception every 2 seconds
        const now = Date.now();
        if (now - lastLogTime > 2000) {
          console.log(`🎙️ Receiving audio: ${audioChunkCount} chunks (${(data.length / 1024).toFixed(1)}KB buffer)`);
          lastLogTime = now;
        }
      } else {
        console.warn('⚠️ Deepgram not ready, state:', deepgramConnection.getReadyState());
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected from STT service');
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      if (deepgramConnection.getReadyState() === 1) {
        deepgramConnection.finish();
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`STT WebSocket server listening on port ${PORT}`);
});
