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

const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'orchestrator' });
});

// TODO: Implement endpoints
// POST /start_session - Create LiveKit session and issue token
// POST /payments/start - Create payment session
// POST /webhooks/payment - Handle PSP webhooks
// WS /stream - WebSocket for TTS streaming

app.listen(PORT, () => {
  console.log(`Orchestrator service listening on port ${PORT}`);
});
