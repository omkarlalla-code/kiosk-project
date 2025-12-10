# Kiosk Communication Protocol

This document defines the message schemas and communication protocol for the kiosk system.

## Transport

- **Audio:** WebRTC media track (Opus codec)
- **Control:** WebRTC DataChannel (reliable, ordered)
- **Payment:** HTTPS REST + WebRTC DataChannel

## Message Format

All DataChannel messages are JSON-encoded:

```json
{
  "type": "message_type",
  "...": "message-specific fields"
}
```

## Message Types

### 1. Image Control Messages

#### img_preload

Instructs the kiosk to preload an image from CDN.

**Direction:** Orchestrator → Kiosk (via DataChannel)

**Schema:**
```json
{
  "type": "img_preload",
  "id": "string",           // Unique image identifier
  "cdn_url": "string",      // Full CDN URL to image
  "playout_ts": "number",   // Millisecond timestamp for preload timing
  "ttl_ms": "number"        // Time-to-live in cache (optional)
}
```

**Example:**
```json
{
  "type": "img_preload",
  "id": "parthenon_overview",
  "cdn_url": "https://cdn.example.com/images/parthenon.webp",
  "playout_ts": 1690000000000,
  "ttl_ms": 8000
}
```

**Behavior:**
- Kiosk fetches image from `cdn_url` and stores in LRU cache
- Image expires from cache after `ttl_ms` milliseconds
- Should be sent ahead of `img_show` for smooth transitions

---

#### img_show

Schedules image to be displayed at a specific playout timestamp.

**Direction:** Orchestrator → Kiosk (via DataChannel)

**Schema:**
```json
{
  "type": "img_show",
  "id": "string",              // Image ID (must be preloaded)
  "playout_ts": "number",      // Exact timestamp to show image
  "transition": "string",      // Transition type: "crossfade", "instant", "slide"
  "duration_ms": "number",     // Transition duration in milliseconds
  "caption": "string",         // Optional caption text
  "credit": "string"           // Optional photo credit
}
```

**Example:**
```json
{
  "type": "img_show",
  "id": "parthenon_overview",
  "playout_ts": 1690000000500,
  "transition": "crossfade",
  "duration_ms": 400,
  "caption": "Parthenon — Athens, 447 BC",
  "credit": "Photo: John Doe"
}
```

**Behavior:**
- Kiosk schedules image display at `playout_ts` using audio clock synchronization
- Performs specified transition (crossfade recommended)
- Displays caption and credit if provided
- Target accuracy: ±50ms (goal), ±100ms (degraded)

---

#### img_ready

Acknowledgment that image has been preloaded successfully.

**Direction:** Kiosk → Orchestrator (via DataChannel) [Optional]

**Schema:**
```json
{
  "type": "img_ready",
  "id": "string",
  "ready": "boolean",
  "cached": "boolean"
}
```

---

### 2. Gesture Control Messages

#### gesture_event

Local gesture detected by MediaPipe (internal to kiosk).

**Direction:** GestureController → ImageScheduler (internal)

**Schema:**
```json
{
  "type": "gesture_event",
  "cmd": "string",             // "next", "prev", "pause", "play"
  "confidence": "number",      // 0.0 to 1.0
  "ts": "number"               // performance.now() timestamp
}
```

---

#### gesture_cmd

Gesture command sent to server for server-side actions.

**Direction:** Kiosk → Orchestrator (via DataChannel)

**Schema:**
```json
{
  "type": "gesture_cmd",
  "cmd": "string",             // Command name
  "session_id": "string",      // Session identifier
  "ts": "number"               // Timestamp
}
```

**Example:**
```json
{
  "type": "gesture_cmd",
  "cmd": "fetch_more_images",
  "session_id": "s123",
  "ts": 1690000000600
}
```

**Behavior:**
- Sent when gesture requires server-side content fetch
- Orchestrator may respond with new `img_preload` messages

---

### 3. Audio Messages

#### audio_frame

Internal message format for streaming audio (not sent via DataChannel).

**Direction:** TTS → Orchestrator → LiveKit

**Schema:**
```json
{
  "type": "audio_frame",
  "frame_id": "number",
  "format": "string",          // "opus" or "pcm"
  "data_base64": "string",     // Base64-encoded audio data
  "playout_ts": "number"       // Playback timestamp
}
```

**Example:**
```json
{
  "type": "audio_frame",
  "frame_id": 123,
  "format": "opus",
  "data_base64": "T2dnUwAC...",
  "playout_ts": 1690000000400
}
```

**Behavior:**
- Used internally between TTS service and Orchestrator
- Orchestrator injects into LiveKit as WebRTC media track
- Kiosk receives via standard WebRTC audio track

---

#### end_of_stream

Signals end of audio narration.

**Direction:** Orchestrator → Kiosk (via DataChannel)

**Schema:**
```json
{
  "type": "end_of_stream",
  "session_id": "string"
}
```

---

### 4. Payment Messages

#### request_payment

Kiosk requests payment from user.

**Direction:** Kiosk → Orchestrator (via DataChannel)

**Schema:**
```json
{
  "type": "request_payment",
  "amount": "number",          // Amount in smallest currency unit (paise for INR)
  "currency": "string",        // "INR", "USD", etc.
  "context": "string",         // Purpose: "unlock_tour_x", "premium_content"
  "session_id": "string"       // Session identifier
}
```

**Example:**
```json
{
  "type": "request_payment",
  "amount": 100,
  "currency": "INR",
  "context": "unlock_greek_mythology_tour",
  "session_id": "s123"
}
```

---

#### payment_ready

Orchestrator responds with payment session details.

**Direction:** Orchestrator → Kiosk (via DataChannel)

**Schema:**
```json
{
  "type": "payment_ready",
  "payment_id": "string",      // Unique payment session ID
  "upi_uri": "string",         // UPI deep link URI
  "qr_base64": "string",       // Base64-encoded QR code PNG
  "amount": "number",          // Amount for display
  "currency": "string",        // Currency code
  "expires_at": "number"       // Expiry timestamp
}
```

**Example:**
```json
{
  "type": "payment_ready",
  "payment_id": "pay_123abc",
  "upi_uri": "upi://pay?pa=merchant@upi&pn=Kiosk&am=1.00&cu=INR&tr=tx123",
  "qr_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "amount": 100,
  "currency": "INR",
  "expires_at": 1690000300000
}
```

**Behavior:**
- Kiosk displays QR code and/or deep link
- User scans QR or clicks deep link to pay via UPI app
- Kiosk waits for `payment_confirm` message

---

#### payment_confirm

Payment confirmation with HMAC signature.

**Direction:** Orchestrator → Kiosk (via DataChannel)

**Schema:**
```json
{
  "type": "payment_confirm",
  "payment_id": "string",      // Payment session ID
  "status": "string",          // "success", "failed", "timeout"
  "txn_id": "string",          // PSP transaction ID
  "amount": "number",          // Confirmed amount
  "signature": "string"        // HMAC-SHA256 signature
}
```

**Example:**
```json
{
  "type": "payment_confirm",
  "payment_id": "pay_123abc",
  "status": "success",
  "txn_id": "razorpay_tx_xyz",
  "amount": 100,
  "signature": "a1b2c3d4e5f6..."
}
```

**Behavior:**
- Kiosk verifies HMAC signature using shared secret
- If valid and status is "success", unlocks content
- If failed, shows error message
- Signature verification prevents spoofing

**Signature Generation:**
```javascript
const crypto = require('crypto');
const payload = JSON.stringify({ payment_id, txn_id, status, amount });
const signature = crypto.createHmac('sha256', SECRET_KEY)
  .update(payload)
  .digest('hex');
```

---

### 5. Session Management

#### start_request

Kiosk requests new session/narration.

**Direction:** Kiosk → Orchestrator (via DataChannel)

**Schema:**
```json
{
  "type": "start_request",
  "topic": "string",           // Requested topic
  "kiosk_id": "string",        // Kiosk identifier
  "session_id": "string"       // Optional existing session
}
```

**Example:**
```json
{
  "type": "start_request",
  "topic": "parthenon_history",
  "kiosk_id": "kiosk-001",
  "session_id": "s123"
}
```

---

#### session_ready

Orchestrator confirms session is ready.

**Direction:** Orchestrator → Kiosk (via DataChannel)

**Schema:**
```json
{
  "type": "session_ready",
  "session_id": "string",
  "topic": "string"
}
```

---

## Playout Timestamp Synchronization

### Overview

All time-sensitive messages use `playout_ts` (millisecond timestamp) for synchronization with audio playback.

### Clock Mapping

The kiosk maps WebRTC audio clock to `performance.now()`:

```javascript
// When audio track starts playing
const audioContext = new AudioContext();
const audioStartTime = audioContext.currentTime;
const perfStartTime = performance.now();

// Calculate offset
const offset = perfStartTime - (audioStartTime * 1000);

// Schedule image show
const delay = message.playout_ts - performance.now();
setTimeout(() => showImage(), delay);
```

### Accuracy Targets

- **Goal:** ±50ms synchronization accuracy
- **Degraded:** ±100ms under packet loss/jitter
- **First audio:** <300ms from request

---

## Error Handling

### Connection Errors

**Direction:** Kiosk → User (UI)

Display connection status:
- "Connecting..." - Initial connection
- "Connected" - WebRTC established
- "Disconnected" - Connection lost
- "Reconnecting..." - Attempting reconnection

---

### Image Load Errors

If image fails to preload:
1. Try fallback local image pack
2. If fallback unavailable, show placeholder
3. Log error for monitoring

---

### Payment Errors

**Direction:** Orchestrator → Kiosk (via DataChannel)

```json
{
  "type": "payment_error",
  "payment_id": "string",
  "error": "string",           // "timeout", "declined", "network_error"
  "message": "string"          // Human-readable message
}
```

**Behavior:**
- Display error to user
- Offer retry or staff override option
- Log for troubleshooting

---

## Flow Diagrams

### Typical Session Flow

```
1. Kiosk → Orchestrator: start_request
2. Orchestrator → Kiosk: session_ready
3. Orchestrator → TTS: stream_synthesize
4. TTS → Orchestrator: audio_frame (streaming)
5. TTS → Orchestrator: img_preload, img_show (interleaved)
6. Orchestrator → LiveKit: inject audio track
7. Orchestrator → Kiosk: img_preload, img_show (via DataChannel)
8. LiveKit → Kiosk: audio (via WebRTC media)
9. Kiosk: plays audio + shows images at playout_ts
10. TTS → Orchestrator: end_of_stream
11. Orchestrator → Kiosk: end_of_stream
```

### Payment Flow

```
1. User → Kiosk: tap "Pay to Start"
2. Kiosk → Orchestrator: request_payment
3. Orchestrator → Payment Backend: create_session
4. Payment Backend → PSP: create_collect_request
5. PSP → Payment Backend: collect_created (QR, URI)
6. Payment Backend → Orchestrator: session_created
7. Orchestrator → Kiosk: payment_ready (QR, URI)
8. Kiosk: displays QR code
9. User → PSP: scans QR, approves payment
10. PSP → Payment Backend: webhook (payment_success)
11. Payment Backend → Orchestrator: payment_confirmed
12. Orchestrator → Kiosk: payment_confirm (signed)
13. Kiosk: verifies signature, unlocks content
```

---

## Security

### Authentication

- Kiosk obtains short-lived JWT token from Orchestrator
- Token includes kiosk_id and session metadata
- Token expires after session ends or 1 hour

### Payment Security

- All payment confirmations include HMAC-SHA256 signature
- Kiosk verifies signature before unlocking content
- Payment sessions expire after 5 minutes
- Rate limiting: max 3 payment attempts per session

### Data Privacy

- No raw webcam frames uploaded to cloud
- MediaPipe runs locally on kiosk
- Minimal PII stored (only transaction IDs for audit)

---

## WebSocket Protocol (TTS Service)

Mock TTS and real TTS services use WebSocket for streaming:

### Connection

```
WS: ws://tts-service:3002/stream?session_id=s123
```

### Messages

Same schema as DataChannel messages (JSON-encoded).

---

## REST API (Orchestrator)

### POST /start_session

Create new session and get LiveKit token.

**Request:**
```json
{
  "kiosk_id": "kiosk-001"
}
```

**Response:**
```json
{
  "session_id": "s123",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "livekit_url": "wss://livekit.example.com"
}
```

---

### POST /payments/start

Create payment session.

**Request:**
```json
{
  "amount": 100,
  "currency": "INR",
  "context": "unlock_tour_x",
  "session_id": "s123"
}
```

**Response:**
```json
{
  "payment_id": "pay_123abc",
  "expires_at": 1690000300000
}
```

---

## Versioning

Protocol version: **v1.0**

Future versions will maintain backward compatibility or provide migration path.
