/**
 * Orchestrator Service
 *
 * Responsibilities:
 * - Session management
 * - LiveKit token issuance
 * - TTS orchestration
 * - Control message routing (img_preload, img_show)
 * - Payment session creation
 * - Webhook handling
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { AccessToken, RoomServiceClient, DataPacket_Kind } = require('livekit-server-sdk');
const crypto = require('crypto');
const WebSocket = require('ws');
const OpusScript = require('opusscript');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (development mode)
app.use(cors());

// Environment variables
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'ws://localhost:3002/ws';
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:3003';
const IMAGE_SCREENER_URL = process.env.IMAGE_SCREENER_URL || 'http://localhost:3001';

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.error('Missing required environment variables: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL');
  process.exit(1);
}

app.use(express.json());

// In-memory session store (use Redis in production)
const sessions = new Map();

// Image library for Greek civilization
let imageLibrary = null;

// Load image library on startup
async function loadImageLibrary() {
  try {
    const libraryPath = path.join(__dirname, '..', '..', '..', 'data', 'greek-images.json');
    const libraryData = await fs.readFile(libraryPath, 'utf-8');
    imageLibrary = JSON.parse(libraryData);
    console.log('✅ Image library loaded');
    console.log(`   Architecture: ${imageLibrary.collections.architecture.length} images`);
    console.log(`   Sculpture: ${imageLibrary.collections.sculpture.length} images`);
    console.log(`   Pottery: ${imageLibrary.collections.pottery.length} images`);
    console.log(`   Daily life: ${imageLibrary.collections.daily_life.length} images`);
  } catch (error) {
    console.error('❌ Failed to load image library:', error.message);
    imageLibrary = { collections: {}, narration_sequences: {} };
  }
}

// Session timeout configuration
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || '600000'); // Default: 10 minutes
const SESSION_CLEANUP_INTERVAL_MS = parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS || '60000'); // Default: 1 minute

// Track session timeouts
const sessionTimeouts = new Map();

// Initialize RoomServiceClient for cleanup operations
const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

/**
 * Set or refresh session timeout
 */
function refreshSessionTimeout(session_id) {
  // Clear existing timeout
  if (sessionTimeouts.has(session_id)) {
    clearTimeout(sessionTimeouts.get(session_id));
  }

  // Set new timeout
  const timeout = setTimeout(() => {
    const session = sessions.get(session_id);
    if (session && session.status === 'active') {
      console.log(`⏰ Session ${session_id} timed out after ${SESSION_TIMEOUT_MS}ms of inactivity`);
      endSession(session_id, 'timeout');
    }
  }, SESSION_TIMEOUT_MS);

  sessionTimeouts.set(session_id, timeout);
}

/**
 * End a session and clean up resources
 */
async function endSession(session_id, reason = 'manual') {
  const session = sessions.get(session_id);
  if (!session) {
    console.log(`Session ${session_id} not found`);
    return { success: false, error: 'Session not found' };
  }

  try {
    // Update session status
    session.status = 'ended';
    session.ended_at = Date.now();
    session.end_reason = reason;

    // Clear timeout
    if (sessionTimeouts.has(session_id)) {
      clearTimeout(sessionTimeouts.get(session_id));
      sessionTimeouts.delete(session_id);
    }

    // Delete LiveKit room to ensure all participants are disconnected
    try {
      await roomService.deleteRoom(session.room_name);
      console.log(`✅ Deleted LiveKit room: ${session.room_name}`);
    } catch (error) {
      // Room might already be deleted or not exist - that's okay
      console.log(`LiveKit room cleanup: ${error.message}`);
    }

    console.log(`✅ Session ${session_id} ended (reason: ${reason})`);
    return { success: true, session };
  } catch (error) {
    console.error(`Error ending session ${session_id}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Cleanup stale sessions periodically
 */
function startSessionCleanup() {
  setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [session_id, session] of sessions.entries()) {
      // Remove ended sessions older than 1 hour
      if (session.status === 'ended' && (now - session.ended_at) > 3600000) {
        sessions.delete(session_id);
        cleanedCount++;
        console.log(`🧹 Removed old session: ${session_id}`);
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleanup: Removed ${cleanedCount} old sessions`);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);

  console.log(`🧹 Session cleanup job started (interval: ${SESSION_CLEANUP_INTERVAL_MS}ms)`);
}

// Start cleanup job
startSessionCleanup();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'orchestrator',
    active_sessions: Array.from(sessions.values()).filter(s => s.status === 'active').length,
    total_sessions: sessions.size
  });
});

// POST /start_session - Create LiveKit session and issue token
app.post('/start_session', async (req, res) => {
  try {
    const { kiosk_id } = req.body;

    if (!kiosk_id) {
      return res.status(400).json({ error: 'kiosk_id is required' });
    }

    // Generate session ID
    const session_id = `session_${crypto.randomBytes(8).toString('hex')}`;
    const room_name = `kiosk_${kiosk_id}_${Date.now()}`;

    // Create LiveKit access token
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: kiosk_id,
      ttl: 3600, // 1 hour
    });

    // Grant permissions
    token.addGrant({
      roomJoin: true,
      room: room_name,
      canPublish: true, // Allow audio publishing for demo
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    // Store session
    sessions.set(session_id, {
      session_id,
      kiosk_id,
      room_name,
      created_at: Date.now(),
      status: 'active',
      last_activity: Date.now(),
    });

    // Set initial timeout
    refreshSessionTimeout(session_id);

    console.log(`Created session ${session_id} for kiosk ${kiosk_id}, room: ${room_name}`);
    console.log(`  Timeout: ${SESSION_TIMEOUT_MS}ms`);

    res.json({
      session_id,
      token: jwt,
      livekit_url: LIVEKIT_URL,
      room_name,
      timeout_ms: SESSION_TIMEOUT_MS,
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /session/:session_id - Get session info
app.get('/session/:session_id', (req, res) => {
  const { session_id } = req.params;
  const session = sessions.get(session_id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// POST /payments/start - Create payment session (placeholder)
app.post('/payments/start', async (req, res) => {
  try {
    const { amount, currency, context, session_id } = req.body;

    const payment_id = `pay_${crypto.randomBytes(8).toString('hex')}`;

    console.log(`Created payment session ${payment_id} for ${amount} ${currency}`);

    res.json({
      payment_id,
      amount,
      currency,
      expires_at: Date.now() + 300000, // 5 minutes
    });
  } catch (error) {
    console.error('Error creating payment session:', error);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
});

// POST /webhooks/payment - Handle PSP webhooks (placeholder)
app.post('/webhooks/payment', async (req, res) => {
  console.log('Received payment webhook:', req.body);

  // TODO: Verify webhook signature
  // TODO: Send payment_confirm to kiosk via DataChannel

  res.json({ received: true });
});

// DELETE /session/:session_id - End session
app.delete('/session/:session_id', async (req, res) => {
  const { session_id } = req.params;

  const result = await endSession(session_id, 'manual');

  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }

  res.json({ message: 'Session ended', session: result.session });
});

// List all active sessions (for debugging)
app.get('/sessions', (req, res) => {
  const activeSessions = Array.from(sessions.values()).filter(s => s.status === 'active');
  res.json({ sessions: activeSessions, count: activeSessions.length });
});

// ========== Image Sync System ==========

/**
 * Preload image via ImageScreener service
 */
async function preloadImage(imageData, playout_ts) {
  try {
    const response = await fetch(`${IMAGE_SCREENER_URL}/preload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: imageData.id,
        cdn_url: imageData.cdn_url,
        playout_ts,
        ttl_ms: 30000,
        resize: imageData.resize
      })
    });

    if (!response.ok) {
      throw new Error(`ImageScreener error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`🖼️ Preloaded image: ${imageData.id} (from_cache: ${result.from_cache})`);
    return result;
  } catch (error) {
    console.error(`Failed to preload image ${imageData.id}:`, error.message);
    return null;
  }
}

/**
 * Send image control message via LiveKit DataChannel
 */
async function sendImageControlMessage(room_name, type, imageData, playout_ts, options = {}) {
  try {
    const message = {
      type,
      id: imageData.id,
      cdn_url: imageData.cdn_url,
      playout_ts,
      caption: imageData.title || options.caption,
      transition: options.transition || 'crossfade',
      duration_ms: options.duration_ms || 400,
      ttl_ms: options.ttl_ms || 8000
    };

    const payload = new Uint8Array(Buffer.from(JSON.stringify(message)));

    await roomService.sendData(room_name, payload, DataPacket_Kind.RELIABLE, {
      destinationIdentities: []
    });

    console.log(`📡 Sent ${type}: ${imageData.id} at playout_ts ${playout_ts}`);
    return true;
  } catch (error) {
    console.error(`Failed to send ${type} message:`, error.message);
    return false;
  }
}

/**
 * Select images based on conversation topic
 */
function selectImagesForTopic(topic) {
  if (!imageLibrary || !imageLibrary.collections) {
    return [];
  }

  const topicLower = topic.toLowerCase();

  // Map keywords to image categories
  if (topicLower.includes('temple') || topicLower.includes('parthenon') || topicLower.includes('architecture')) {
    return imageLibrary.collections.architecture || [];
  } else if (topicLower.includes('sculpture') || topicLower.includes('statue') || topicLower.includes('art')) {
    return imageLibrary.collections.sculpture || [];
  } else if (topicLower.includes('pottery') || topicLower.includes('vase') || topicLower.includes('ceramic')) {
    return imageLibrary.collections.pottery || [];
  } else if (topicLower.includes('daily') || topicLower.includes('life') || topicLower.includes('agora') || topicLower.includes('olympic')) {
    return imageLibrary.collections.daily_life || [];
  }

  // Default: show architecture highlights
  return imageLibrary.collections.architecture?.slice(0, 3) || [];
}

// ========== Conversation Flow: STT → LLM → TTS ==========

/**
 * POST /converse - Handle user message through full conversation pipeline
 * Body: { session_id, message }
 * Flow: User message → LLM → TTS → LiveKit audio + synchronized images
 */
app.post('/converse', async (req, res) => {
  try {
    const { session_id, message } = req.body;

    if (!session_id || !message) {
      return res.status(400).json({ error: 'session_id and message are required' });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Refresh session timeout on activity
    session.last_activity = Date.now();
    refreshSessionTimeout(session_id);

    console.log(`💬 [${session_id}] User said: "${message}"`);

    // Step 1: Send message to LLM service
    const llmResponse = await fetch(`${LLM_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id,
        message,
        stream: false
      })
    });

    if (!llmResponse.ok) {
      throw new Error(`LLM service error: ${llmResponse.statusText}`);
    }

    const { response: llmText } = await llmResponse.json();
    console.log(`🤖 [${session_id}] Assistant response: "${llmText}"`);

    // Step 2: Select and preload relevant images based on conversation topic
    const relevantImages = selectImagesForTopic(message);
    console.log(`🖼️ Selected ${relevantImages.length} images for topic: "${message}"`);

    // Step 3: Estimate TTS duration and calculate playout timestamps
    // Rough estimate: 150 words per minute = 2.5 words per second = 0.4 seconds per word
    const wordCount = llmText.split(/\s+/).length;
    const estimatedDurationMs = Math.max(wordCount * 400, 3000); // At least 3 seconds
    const currentTime = Date.now();
    const speechStartTime = currentTime + 1000; // Start speech in 1 second

    // Step 4: Preload images and send control messages
    if (relevantImages.length > 0) {
      // Calculate timing for each image based on speech duration
      const imageDurationMs = Math.floor(estimatedDurationMs / relevantImages.length);

      for (let i = 0; i < Math.min(relevantImages.length, 3); i++) {
        const image = relevantImages[i];
        const imagePlayoutTime = speechStartTime + (i * imageDurationMs);

        // Preload image via ImageScreener
        await preloadImage(image, imagePlayoutTime);

        // Send img_preload message (tells frontend to prepare the image)
        await sendImageControlMessage(
          session.room_name,
          'img_preload',
          image,
          imagePlayoutTime,
          { ttl_ms: imageDurationMs + 2000 }
        );

        // Send img_show message (tells frontend when to display it)
        await sendImageControlMessage(
          session.room_name,
          'img_show',
          image,
          imagePlayoutTime,
          {
            transition: 'crossfade',
            duration_ms: 400,
            ttl_ms: imageDurationMs
          }
        );
      }

      console.log(`✅ Preloaded and scheduled ${Math.min(relevantImages.length, 3)} images`);
    }

    // Step 5: Send LLM response to TTS and stream to LiveKit
    // Start TTS streaming in background
    streamTextToLiveKit(session, llmText);

    res.json({
      success: true,
      session_id,
      user_message: message,
      assistant_response: llmText,
      status: 'streaming_audio',
      images_scheduled: Math.min(relevantImages.length, 3),
      estimated_duration_ms: estimatedDurationMs
    });

  } catch (error) {
    console.error('Conversation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stream arbitrary text to LiveKit as TTS audio
 */
async function streamTextToLiveKit(session, text) {
  const { room_name, session_id } = session;

  console.log(`🎙️ Streaming TTS to LiveKit room: ${room_name}`);

  try {
    // Connect to TTS WebSocket
    const ttsWs = new WebSocket(TTS_SERVICE_URL);

    // Create Opus encoder
    const SAMPLE_RATE = 48000;
    const CHANNELS = 1;
    const FRAME_SIZE = 960;
    const encoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO);

    let frameCount = 0;

    ttsWs.on('open', async () => {
      console.log('✅ Connected to TTS service for conversation');

      // Request TTS for the assistant's response
      ttsWs.send(JSON.stringify({
        type: 'synthesize_text',
        text,
        session_id
      }));
    });

    ttsWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'audio_frame') {
          // Decode PCM from base64
          const pcmData = Buffer.from(message.data_base64, 'base64');

          // Convert to Int16Array for Opus encoder
          const pcmSamples = new Int16Array(
            pcmData.buffer,
            pcmData.byteOffset,
            pcmData.byteLength / 2
          );

          // Encode to Opus (ready for LiveKit injection)
          const opusPacket = encoder.encode(pcmSamples, FRAME_SIZE);

          frameCount++;

          // Note: Audio packets ready but need LiveKit Ingress for actual streaming
          // For now, they're being generated and encoded successfully
        } else if (message.type === 'end_of_stream') {
          console.log(`✅ TTS complete: ${frameCount} frames for conversation`);
          ttsWs.close();

          setTimeout(() => {
            if (encoder) {
              encoder.delete();
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error processing TTS message:', error);
      }
    });

    ttsWs.on('error', (error) => {
      console.error('TTS WebSocket error:', error.message);
    });

    ttsWs.on('close', () => {
      console.log('TTS connection closed for conversation');
    });

  } catch (error) {
    console.error('Error in TTS streaming:', error);
  }
}

// ========== TTS Streaming with Opus Encoding ==========

/**
 * POST /start_narration - Start TTS narration for a session
 * Body: { session_id, topic }
 */
app.post('/start_narration', async (req, res) => {
  try {
    const { session_id, topic = 'greek_civilization' } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Refresh session timeout on activity
    session.last_activity = Date.now();
    refreshSessionTimeout(session_id);

    console.log(`Starting narration for session ${session_id}, topic: ${topic}`);

    // Start TTS streaming in background
    streamTTSToLiveKit(session, topic);

    res.json({
      message: 'Narration started',
      session_id,
      topic
    });
  } catch (error) {
    console.error('Error starting narration:', error);
    res.status(500).json({ error: 'Failed to start narration' });
  }
});

/**
 * Stream TTS audio to LiveKit with Opus encoding
 *
 * Note: Server-side audio publishing to LiveKit requires one of the following:
 * 1. LiveKit Ingress API (RTMP/WHIP endpoint)
 * 2. LiveKit Agents SDK (Python-based)
 * 3. WebRTC client connection with wrtc (requires native compilation)
 *
 * For now, this implementation:
 * - Encodes PCM to Opus (ready for injection)
 * - Sends control messages via RoomServiceClient
 * - Audio track publishing requires additional setup
 */
async function streamTTSToLiveKit(session, topic) {
  const { room_name, session_id } = session;

  console.log(`Starting TTS stream for LiveKit room: ${room_name}`);

  try {
    // Connect to TTS WebSocket
    const ttsWs = new WebSocket(TTS_SERVICE_URL);

    // Create Opus encoder
    const SAMPLE_RATE = 48000;
    const CHANNELS = 1;
    const FRAME_SIZE = 960;
    const encoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.AUDIO);

    let frameCount = 0;
    const opusPackets = []; // Store Opus packets for potential future injection

    ttsWs.on('open', async () => {
      console.log('✅ Connected to TTS service');

      // Request TTS stream
      ttsWs.send(JSON.stringify({
        type: 'start_stream',
        topic,
        session_id
      }));
    });

    ttsWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'audio_frame':
            // Decode PCM from base64
            const pcmData = Buffer.from(message.data_base64, 'base64');

            // Convert to Int16Array for Opus encoder
            const pcmSamples = new Int16Array(
              pcmData.buffer,
              pcmData.byteOffset,
              pcmData.byteLength / 2
            );

            // Encode to Opus
            const opusPacket = encoder.encode(pcmSamples, FRAME_SIZE);
            opusPackets.push(opusPacket);

            // Audio packets are ready but need LiveKit Ingress for injection
            // For production: Set up LiveKit Ingress endpoint and publish via RTMP/WHIP

            if (frameCount % 50 === 0) {
              console.log(`✅ Encoded frame ${frameCount}, Opus size: ${opusPacket.length} bytes`);
            }

            frameCount++;
            break;

          case 'img_preload':
          case 'img_show':
            // Send control message via RoomServiceClient
            try {
              const controlMessage = {
                type: message.type,
                id: message.id,
                cdn_url: message.cdn_url,
                transition: message.transition,
                duration_ms: message.duration_ms,
                caption: message.caption,
                credit: message.credit,
                ttl_ms: message.ttl_ms,
                playout_ts: message.playout_ts,
                offset: message.offset
              };

              const payload = new Uint8Array(Buffer.from(JSON.stringify(controlMessage)));

              // Send data message to all participants in the room
              await roomService.sendData(room_name, payload, DataPacket_Kind.RELIABLE, {
                destinationIdentities: [] // Empty = broadcast to all
              });

              console.log(`📋 Sent control message: ${message.type} - ${message.id}`);
            } catch (error) {
              console.error('Error sending control message:', error.message);
            }
            break;

          case 'end_of_stream':
            console.log(`✅ TTS stream completed: ${frameCount} frames encoded`);
            console.log(`   Total Opus packets ready: ${opusPackets.length}`);

            // Send end_of_stream marker
            try {
              const payload = new Uint8Array(Buffer.from(JSON.stringify({
                type: 'end_of_stream',
                session_id,
                total_frames: frameCount
              })));

              await roomService.sendData(room_name, payload, DataPacket_Kind.RELIABLE, {
                destinationIdentities: []
              });

              console.log(`📋 Sent end_of_stream marker`);
            } catch (error) {
              console.error('Error sending end_of_stream:', error.message);
            }

            ttsWs.close();

            // Clean up encoder
            setTimeout(() => {
              if (encoder) {
                encoder.delete();
              }
            }, 1000);
            break;

          case 'error':
            console.error('TTS error:', message.message);
            ttsWs.close();
            if (encoder) {
              encoder.delete();
            }
            break;
        }
      } catch (error) {
        console.error('Error processing TTS message:', error);
      }
    });

    ttsWs.on('error', (error) => {
      console.error('TTS WebSocket error:', error.message);
    });

    ttsWs.on('close', () => {
      console.log('TTS connection closed');
    });

  } catch (error) {
    console.error('Error in TTS streaming:', error);
    throw error;
  }
}

// Start server with image library loaded
async function start() {
  await loadImageLibrary();

  app.listen(PORT, () => {
    console.log(`\n🎯 Orchestrator Service`);
    console.log(`📡 Listening on port ${PORT}`);
    console.log(`🎙️ LiveKit URL: ${LIVEKIT_URL}`);
    console.log(`🔊 TTS Service: ${TTS_SERVICE_URL}`);
    console.log(`🧠 LLM Service: ${LLM_SERVICE_URL}`);
    console.log(`🖼️ ImageScreener: ${IMAGE_SCREENER_URL}`);
    console.log(`\n✅ Ready for conversational AI with synchronized images\n`);
  });
}

start();
