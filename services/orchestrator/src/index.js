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
    const libraryPath = path.join(__dirname, '..', '..', '..', 'data', 'greek-images-local.json');
    const libraryData = await fs.readFile(libraryPath, 'utf-8');
    imageLibrary = JSON.parse(libraryData);
    console.log('✅ Image library loaded');

    // Count total images across all categories
    let totalImages = 0;
    const categoryCounts = {};
    for (const [categoryName, images] of Object.entries(imageLibrary.collections || {})) {
      const count = images.length;
      totalImages += count;
      categoryCounts[categoryName] = count;
    }

    console.log(`   Total images: ${totalImages} across ${Object.keys(imageLibrary.collections).length} categories`);
    // Show first few categories
    const categories = Object.entries(categoryCounts).slice(0, 5);
    categories.forEach(([name, count]) => {
      console.log(`   ${name}: ${count} images`);
    });
    if (Object.keys(categoryCounts).length > 5) {
      console.log(`   ... and ${Object.keys(categoryCounts).length - 5} more categories`);
    }
  } catch (error) {
    console.error('❌ Failed to load image library:', error.message);
    imageLibrary = { collections: {} };
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

    const SESSION_DURATION_SECONDS = 300; // 5 minutes

    // Store session
    sessions.set(session_id, {
      session_id,
      kiosk_id,
      room_name,
      created_at: Date.now(),
      duration_seconds: SESSION_DURATION_SECONDS,
      status: 'active',
      last_activity: Date.now(),
    });

    // Set initial timeout
    refreshSessionTimeout(session_id);

    console.log(`Created session ${session_id} for kiosk ${kiosk_id}, room: ${room_name}`);
    console.log(`  Duration: ${SESSION_DURATION_SECONDS}s`);

    res.json({
      session_id,
      token: jwt,
      livekit_url: LIVEKIT_URL,
      room_name,
      duration_seconds: SESSION_DURATION_SECONDS,
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

// POST /session/:sessionId/end - Trigger final goodbye message
app.post('/session/:sessionId/end', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  console.log(`🔚 Session ${sessionId} timer ended. Generating goodbye message.`);

  try {
    // 1. Call LLM for a goodbye message
    const llmResponse = await fetch(`${LLM_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: "The user's session time is up. Say a very brief, friendly goodbye.",
        stream: false
      })
    });
    if (!llmResponse.ok) throw new Error('LLM service failed for goodbye message.');
    
    const llmData = await llmResponse.json();
    const goodbyeText = llmData.response.speech_response || "Thank you for visiting. Goodbye!";

    // 2. Get TTS audio for the goodbye message
    const ttsHttpUrl = TTS_SERVICE_URL.replace('ws://', 'http://').replace(/\/ws$/, '');
    const ttsResponse = await fetch(`${ttsHttpUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: goodbyeText }),
    });
    if (!ttsResponse.ok) throw new Error('TTS service failed for goodbye message.');

    const audioBuffer = await ttsResponse.buffer();
    const audioBase64 = audioBuffer.toString('base64');

    // 3. Send final audio to client
    res.json({
      success: true,
      audio_base64: audioBase64,
    });

    // 4. Clean up the session on the server
    await endSession(sessionId, 'timer_expired');

  } catch (error) {
    console.error(`Error generating goodbye message for session ${sessionId}:`, error);
    // Respond with a silent success to not show an error on the frontend
    res.json({ success: true, audio_base64: '' });
     await endSession(sessionId, 'goodbye_error');
  }
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
      title: imageData.title || imageData.id,
      category: imageData.category || 'Greek Civilization',
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
 * Select images based on conversation topic using keyword matching
 */
function selectImagesForTopic(topic) {
  if (!imageLibrary || !imageLibrary.collections) {
    return [];
  }

  const topicLower = topic.toLowerCase();
  const topicWords = topicLower.split(/\s+/);

  // Collect all images from all categories into a flat array
  const allImages = [];
  for (const category of Object.values(imageLibrary.collections)) {
    allImages.push(...category);
  }

  // Score each image based on keyword matches
  const scoredImages = allImages.map(image => {
    let score = 0;

    // Check if any topic words match image keywords
    if (image.keywords) {
      for (const keyword of image.keywords) {
        // Exact word match in topic
        if (topicWords.includes(keyword.toLowerCase())) {
          score += 10;
        }
        // Partial match (keyword appears anywhere in topic)
        else if (topicLower.includes(keyword.toLowerCase())) {
          score += 5;
        }
      }
    }

    // Bonus for matching category name
    if (topicLower.includes(image.category)) {
      score += 3;
    }

    // Bonus for matching title
    if (image.title && topicLower.includes(image.title.toLowerCase())) {
      score += 15;
    }

    return { image, score };
  });

  // Sort by score (highest first) and return top matches
  const topMatches = scoredImages
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // Get top 5 matches
    .map(item => item.image);

  // If no matches, return random selection
  if (topMatches.length === 0) {
    const randomImages = allImages.sort(() => Math.random() - 0.5).slice(0, 3);
    return randomImages;
  }

  return topMatches;
}

/**
 * Enrich LLM-generated image payload with real CDN URLs from image library
 * Takes the fake placeholder from LLM and finds matching real image
 */
function enrichImagePayload(llmPayload) {
  if (!imageLibrary || !imageLibrary.collections) {
    console.warn(`⚠️ No image library loaded, using LLM placeholder for ${llmPayload.id}`);
    return llmPayload;
  }

  // Extract searchable keywords from the LLM's image ID
  // e.g., "parthenon_athens" -> ["parthenon", "athens"]
  const searchTerms = llmPayload.id.toLowerCase().split('_').join(' ');

  // Collect all images from all categories
  const allImages = [];
  for (const category of Object.values(imageLibrary.collections)) {
    allImages.push(...category);
  }

  // Find best match based on keywords
  let bestMatch = null;
  let bestScore = 0;

  for (const image of allImages) {
    let score = 0;

    // Match against image keywords
    if (image.keywords) {
      for (const keyword of image.keywords) {
        if (searchTerms.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }
    }

    // Match against title
    if (image.title && searchTerms.includes(image.title.toLowerCase())) {
      score += 20;
    }

    // Match against ID
    if (image.id && searchTerms.includes(image.id.toLowerCase())) {
      score += 30; // Exact ID match is best
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = image;
    }
  }

  // If we found a match, use the real image data
  if (bestMatch) {
    console.log(`✅ Matched "${llmPayload.id}" → "${bestMatch.id}" (score: ${bestScore})`);
    return {
      id: bestMatch.id,
      cdn_url: bestMatch.cdn_url,
      title: bestMatch.title,
      category: bestMatch.category,
      keywords: bestMatch.keywords,
      era: bestMatch.era
    };
  }

  // No match found - warn but use LLM placeholder (will fail gracefully on frontend)
  console.warn(`⚠️ No match found for "${llmPayload.id}", image may fail to load`);
  return llmPayload;
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

    // The LLM now returns a JSON object with speech and a timeline
    const llmData = await llmResponse.json();
    
    // Attempt to parse the inner JSON string if the LLM returns a stringified object
    let parsedLlmData;
    if (typeof llmData.response === 'string') {
        try {
            // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
            let cleanedResponse = llmData.response.trim();
            if (cleanedResponse.startsWith('```')) {
                // Remove opening fence (```json or ```)
                cleanedResponse = cleanedResponse.replace(/^```(?:json)?\n?/, '');
                // Remove closing fence (```)
                cleanedResponse = cleanedResponse.replace(/\n?```$/, '');
            }
            parsedLlmData = JSON.parse(cleanedResponse);
        } catch (e) {
            console.error("LLM response is not a valid JSON string:", llmData.response);
            // Fallback: use the text directly and an empty timeline
            parsedLlmData = { speech_response: llmData.response, timeline_events: [] };
        }
    } else {
        parsedLlmData = llmData.response;
    }

    const { speech_response: llmText, timeline_events: timelineEvents, end_chat: endChat } = parsedLlmData;

    console.log(`🤖 [${session_id}] Assistant response: "${llmText}"`);
    if (endChat) {
      console.log(`🔚 [${session_id}] End chat signal from LLM`);
    }

    // Step 2 & 3: Get TTS audio from the new endpoint
    let audioBase64 = '';
    let ttsError = null;
    try {
      // Convert WebSocket URL to HTTP and remove /ws path if present
      const ttsHttpUrl = TTS_SERVICE_URL.replace('ws://', 'http://').replace(/\/ws$/, '');
      const ttsResponse = await fetch(`${ttsHttpUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: llmText }),
        timeout: 10000 // 10 second timeout
      });

      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.buffer();
        audioBase64 = audioBuffer.toString('base64');
        console.log(`🎤 Fetched TTS audio: ${(audioBase64.length / 1024).toFixed(1)}KB`);
      } else {
        ttsError = `TTS service returned ${ttsResponse.status}: ${ttsResponse.statusText}`;
        console.error(`❌ TTS service request failed: ${ttsError}`);
      }
    } catch (error) {
      ttsError = error.message;
      console.error(`❌ Failed to get TTS audio:`, ttsError);
    }
    
    // Step 4: Schedule image events based on the LLM's timeline
    if (timelineEvents && timelineEvents.length > 0) {
      // (Image scheduling logic remains the same)
      const speechStartTime = Date.now();
      console.log(`🗓️ [${session_id}] Scheduling ${timelineEvents.length} timeline events.`);

      for (const event of timelineEvents) {
        if (event.action && event.action.type === 'PRELOAD_IMAGE') {
          const { payload } = event.action;
          const offset = event.time_offset_ms || 0;
          const enrichedPayload = enrichImagePayload(payload);
          const imagePlayoutTime = speechStartTime + offset;
          const preloadOffset = Math.max(0, offset - 1500);

          setTimeout(async () => {
            await preloadImage(enrichedPayload, imagePlayoutTime);
            await sendImageControlMessage(session.room_name, 'img_preload', enrichedPayload, imagePlayoutTime, { ttl_ms: 5000 });
          }, preloadOffset);

          setTimeout(async () => {
            await sendImageControlMessage(session.room_name, 'img_show', enrichedPayload, imagePlayoutTime, { transition: 'crossfade', duration_ms: 400, ttl_ms: 8000 });
          }, offset);
        }
      }
    }

    // Send end_chat signal via DataChannel if needed
    if (endChat) {
      try {
        await sendImageControlMessage(session.room_name, 'end_chat', {}, Date.now(), {});
        console.log(`📤 [${session_id}] Sent end_chat signal via DataChannel`);
      } catch (error) {
        console.error(`❌ Failed to send end_chat signal:`, error.message);
      }
    }

    // Step 5: Respond to the initial request with speech text and audio
    res.json({
      success: true,
      session_id,
      user_message: message,
      assistant_response: llmText,
      audio_base64: audioBase64, // Include the audio data (empty string if TTS failed)
      images_scheduled: (timelineEvents || []).length,
      end_chat: endChat || false,
      tts_error: ttsError // Include TTS error if present
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

  const server = app.listen(PORT, () => {
    console.log(`\n🎯 Orchestrator Service`);
    console.log(`📡 Listening on port ${PORT}`);
    console.log(`🎙️ LiveKit URL: ${LIVEKIT_URL}`);
    console.log(`🔊 TTS Service: ${TTS_SERVICE_URL}`);
    console.log(`🧠 LLM Service: ${LLM_SERVICE_URL}`);
    console.log(`🖼️ ImageScreener: ${IMAGE_SCREENER_URL}`);
    console.log(`\n✅ Ready for conversational AI with synchronized images\n`);
  });

  // ========== WebSocket Server for Operator Panel ==========
  const wss = new WebSocket.Server({ server });

  // Store clients based on their role
  const operatorClients = new Set();
  const kioskClients = new Map(); // Use Map to store kiosks waiting for payment

  function broadcastLog(level, message) {
    const logEntry = {
      type: 'log_event',
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    const logString = JSON.stringify(logEntry);
    operatorClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(logString);
      }
    });
  }

  // Override console.log and console.error to broadcast
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    originalConsoleLog.apply(console, args);
    broadcastLog('info', message);
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    originalConsoleError.apply(console, args);
    broadcastLog('error', message);
  };


  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const role = url.searchParams.get('role');
    const kioskId = url.searchParams.get('kioskId');

    if (role === 'operator') {
      console.log('🔌 Operator client connected');
      operatorClients.add(ws);

      ws.on('message', (message) => {
        try {
          const parsed = JSON.parse(message);
          if (parsed.type === 'approve_payment' && parsed.kioskId) {
            console.log(`✅ Payment approved by operator for kiosk: ${parsed.kioskId}`);
            const waitingKiosk = kioskClients.get(parsed.kioskId);
            if (waitingKiosk && waitingKiosk.readyState === WebSocket.OPEN) {
              waitingKiosk.send(JSON.stringify({ type: 'payment_confirmed' }));
              kioskClients.delete(parsed.kioskId); // Remove from waiting list
            }
          } else if (parsed.type === 'terminate_session' && parsed.sessionId) {
            console.log(`🛑 Operator requested termination of session: ${parsed.sessionId}`);
            const session = sessions.get(parsed.sessionId);
            if (session) {
              broadcastLog('warn', `Operator terminated session: ${parsed.sessionId}`);
              endSession(parsed.sessionId, 'operator_terminated');
            } else {
              broadcastLog('error', `Session ${parsed.sessionId} not found for termination`);
              console.warn(`⚠️ Session ${parsed.sessionId} not found for termination`);
            }
          }
        } catch (e) {
          console.error('Failed to parse operator message:', e);
        }
      });

      ws.on('close', () => {
        console.log('🔌 Operator client disconnected');
        operatorClients.delete(ws);
      });

    } else if (role === 'kiosk' && kioskId) {
      console.log(`🔌 Kiosk client connected, waiting for payment: ${kioskId}`);
      kioskClients.set(kioskId, ws);

      // Notify operators that a kiosk is waiting
      const waitingMessage = JSON.stringify({ type: 'kiosk_waiting', kioskId });
      operatorClients.forEach(op => op.send(waitingMessage));

      ws.on('close', () => {
        console.log(`🔌 Kiosk client disconnected: ${kioskId}`);
        kioskClients.delete(kioskId);
        // Notify operators that kiosk is no longer waiting
        const cancelledMessage = JSON.stringify({ type: 'kiosk_cancelled', kioskId });
        operatorClients.forEach(op => op.send(cancelledMessage));
      });

    } else {
      console.log('🔌 Unidentified client connected, closing connection.');
      ws.terminate();
    }

    ws.on('error', (error) => console.error('WebSocket error:', error));
  });
  // Central loop to broadcast session timers
  setInterval(() => {
    const activeSessions = [];
    const now = Date.now();

    for (const session of sessions.values()) {
      if (session.status === 'active') {
        const elapsedTime = now - session.created_at;
        const remaining = Math.max(0, session.duration_seconds - Math.floor(elapsedTime / 1000));
        activeSessions.push({
          sessionId: session.session_id,
          kioskId: session.kiosk_id,
          remaining,
        });
      }
    }

    if (activeSessions.length > 0) {
      const updateMessage = JSON.stringify({
        type: 'sessions_update',
        sessions: activeSessions,
      });
      operatorClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(updateMessage);
        }
      });
    }
  }, 1000);
}

start();
