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
const { AccessToken } = require('livekit-server-sdk');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  console.error('Missing required environment variables: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL');
  process.exit(1);
}

app.use(express.json());

// In-memory session store (use Redis in production)
const sessions = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'orchestrator' });
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
      canPublish: false, // Kiosk only receives
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
    });

    console.log(`Created session ${session_id} for kiosk ${kiosk_id}, room: ${room_name}`);

    res.json({
      session_id,
      token: jwt,
      livekit_url: LIVEKIT_URL,
      room_name,
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
app.delete('/session/:session_id', (req, res) => {
  const { session_id } = req.params;
  const session = sessions.get(session_id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = 'ended';
  session.ended_at = Date.now();

  console.log(`Session ${session_id} ended`);

  res.json({ message: 'Session ended', session });
});

// List all active sessions (for debugging)
app.get('/sessions', (req, res) => {
  const activeSessions = Array.from(sessions.values()).filter(s => s.status === 'active');
  res.json({ sessions: activeSessions, count: activeSessions.length });
});

app.listen(PORT, () => {
  console.log(`Orchestrator service listening on port ${PORT}`);
  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
});
