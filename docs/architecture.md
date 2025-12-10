# Architecture Documentation

## System Overview

The kiosk system is designed as a distributed, cloud-native application optimized for low-latency audio+image synchronization with gesture control and payment integration.

## Core Components

### 1. Kiosk Client (Electron)

**Technology:** Electron, WebRTC (LiveKit SDK), MediaPipe, HTML5

**Responsibilities:**
- Establish WebRTC connection to LiveKit SFU
- Receive Opus-encoded audio via media track
- Receive control messages via DataChannel
- Schedule image displays based on playout_ts
- Run MediaPipe gesture recognition locally
- Display payment QR codes and handle confirmations

**Performance Considerations:**
- Audio decoding: Native WebRTC (Opus)
- Image caching: LRU with 20-50 image capacity
- Gesture recognition: 5-10 FPS, CPU mode
- Rendering: Two-buffer system for crossfade
- Memory: Target <1.5GB RSS on 16GB system

---

### 2. LiveKit SFU (WebRTC Server)

**Technology:** LiveKit (Go-based SFU)

**Responsibilities:**
- WebRTC signaling and media relay
- Server-side track injection (from Orchestrator)
- DataChannel message relay (bidirectional)
- Client session management

**Deployment Options:**
- **Hosted:** LiveKit Cloud (recommended for MVP)
- **Self-hosted:** Docker container on Cloud Run or VM

**Scalability:**
- Horizontal scaling via LiveKit cluster
- Per-room load balancing

---

### 3. Orchestrator Service (Cloud Run)

**Technology:** Node.js, Express, LiveKit Server SDK

**Responsibilities:**
- Session lifecycle management
- LiveKit token issuance (JWT)
- TTS stream coordination
- Audio encoding (PCM → Opus if needed)
- Server-side audio track injection to LiveKit
- DataChannel message routing
- Payment session creation
- PSP webhook handling

**Endpoints:**
- `POST /start_session` - Create session, issue token
- `POST /payments/start` - Create payment session
- `POST /webhooks/payment` - Receive PSP callbacks
- `WS /stream` - WebSocket to TTS service
- `GET /health` - Health check

**Scalability:**
- Stateless design (session state in memory or Redis)
- Auto-scaling on Cloud Run (0-N instances)
- WebSocket stickiness via session affinity

---

### 4. TTS Service

**Technology:** Google Cloud TTS (managed) or self-hosted RealtimeTTS

**Responsibilities:**
- Stream audio chunks incrementally (PCM or Opus)
- Emit control messages (img_preload, img_show) with playout_ts
- Low-latency first-frame (<150ms target)

**Message Flow:**
```
Orchestrator → TTS: { text, voice, streaming: true }
TTS → Orchestrator: audio_frame (stream)
TTS → Orchestrator: img_preload (interleaved)
TTS → Orchestrator: img_show (interleaved)
TTS → Orchestrator: end_of_stream
```

**Latency Budget:**
- TTS first-frame: <150ms
- Chunk rate: 20ms audio per chunk
- Target jitter: <10ms

---

### 5. Image Screener Service (Cloud Run)

**Technology:** Node.js, Sharp (libvips), LRU Cache

**Responsibilities:**
- Warm CDN edge caches (HEAD/GET requests)
- Resize images to optimal display size (1920x1080)
- Maintain LRU cache of recent images
- Return img_ready acknowledgments

**Endpoints:**
- `POST /preload` - Preload image and warm CDN
- `GET /ready/:id` - Check if image is ready
- `GET /health` - Health check

**Optimization:**
- Async preload (non-blocking)
- LRU cache: 500 images max
- NVMe → RAM caching
- Image format: WebP preferred

---

### 6. Payment Backend (Cloud Run)

**Technology:** Node.js, Razorpay/Cashfree SDK, crypto (HMAC)

**Responsibilities:**
- Create UPI payment sessions via PSP API
- Generate QR codes (via PSP)
- Handle PSP webhook callbacks
- Verify payment signatures
- Sign payment_confirm messages (HMAC-SHA256)

**Endpoints:**
- `POST /create_session` - Create payment session
- `POST /webhooks/razorpay` - Razorpay webhook
- `POST /webhooks/cashfree` - Cashfree webhook
- `GET /status/:payment_id` - Payment status
- `GET /health` - Health check

**Security:**
- HMAC verification of PSP webhooks
- HMAC signing of payment_confirm messages
- Short TTLs (5 minutes for payment sessions)
- Rate limiting (3 attempts per session)

---

### 7. CDN + Object Storage

**Technology:** Cloud Storage + Cloud CDN (or S3 + CloudFront)

**Responsibilities:**
- Host images (50-200 high-quality images)
- Edge caching for low-latency delivery
- CORS configuration for browser access

**Configuration:**
- Public read access
- Cache TTL: 1 hour (configurable)
- Image format: WebP (fallback: JPEG)
- Compression: Moderate (balance quality/size)

---

## Data Flow

### Session Initialization

```
1. Kiosk → Orchestrator: POST /start_session
2. Orchestrator generates short-lived JWT token
3. Orchestrator → Kiosk: { token, livekit_url, session_id }
4. Kiosk → LiveKit: connect(token)
5. LiveKit establishes WebRTC connection
6. Kiosk opens DataChannel
```

### Audio + Image Streaming

```
1. User triggers narration (tap or gesture)
2. Kiosk → Orchestrator: start_request (via DataChannel)
3. Orchestrator → TTS: stream_synthesize(topic)
4. TTS streams audio_frame + control messages
5. Orchestrator encodes to Opus (if needed)
6. Orchestrator → LiveKit: inject audio track
7. Orchestrator → ImageScreener: preload images
8. Orchestrator → Kiosk: img_preload (via DataChannel)
9. Orchestrator → Kiosk: img_show (via DataChannel)
10. Kiosk schedules image swap at playout_ts
11. LiveKit → Kiosk: audio (WebRTC media track)
12. Kiosk plays audio + shows images in sync
```

### Payment Flow

```
1. User taps "Pay to Start"
2. Kiosk → Orchestrator: request_payment (via DataChannel)
3. Orchestrator → Payment Backend: create_session
4. Payment Backend → PSP: create_collect_request
5. PSP → Payment Backend: { collect_id, qr, upi_uri }
6. Payment Backend → Orchestrator: { payment_id, qr, upi_uri }
7. Orchestrator → Kiosk: payment_ready (via DataChannel)
8. Kiosk displays QR code
9. User scans QR, approves via UPI app
10. PSP → Payment Backend: webhook(payment_success)
11. Payment Backend verifies webhook signature
12. Payment Backend signs payment_confirm message
13. Payment Backend → Orchestrator: payment_confirmed
14. Orchestrator → Kiosk: payment_confirm (via DataChannel)
15. Kiosk verifies HMAC signature
16. Kiosk unlocks content
```

---

## Clock Synchronization

### Problem

Audio is played via WebRTC (audio clock) while images are scheduled via JavaScript (performance.now clock). These clocks drift over time.

### Solution

Map audio clock to performance.now() at audio track start:

```javascript
// Audio track subscription
track.on('subscribed', () => {
  const audioContext = new AudioContext();
  const audioStartTime = audioContext.currentTime;
  const perfStartTime = performance.now();

  // Calculate offset
  const offset = perfStartTime - (audioStartTime * 1000);

  // Use offset to schedule images
  function scheduleImage(playout_ts) {
    const delay = playout_ts - performance.now();
    setTimeout(() => showImage(), Math.max(0, delay));
  }
});
```

### Accuracy

- Target: ±50ms under normal conditions
- Degraded: ±100ms under packet loss/jitter
- Periodic re-sync every 30s (optional)

---

## Gesture Recognition

### MediaPipe Integration

**Model:** MediaPipe Hands (lightweight)

**Configuration:**
- Max hands: 1
- Model complexity: 0 (lightweight)
- Min detection confidence: 0.5
- Min tracking confidence: 0.5
- Resolution: 480x270
- FPS: 5-10

**Gesture Mapping:**
- Swipe right → Next image
- Swipe left → Previous image
- Closed fist → Pause
- Open palm → Play

**Debouncing:**
- 250-500ms debounce window
- Prevents rapid-fire gestures

**Performance:**
- Run in Web Worker to avoid blocking UI
- CPU mode (no GPU dependency)
- Target: <10% CPU on i5 13th gen

---

## Error Handling & Resilience

### Network Failures

**Audio track lost:**
1. LiveKit auto-reconnects
2. Kiosk shows "Reconnecting..." status
3. Resume from last known position

**DataChannel disconnected:**
1. Attempt reconnection
2. Fallback to cached images
3. Show local content until reconnected

**CDN unreachable:**
1. Use local fallback image pack
2. Show placeholder image
3. Retry fetch in background

### Service Failures

**TTS service down:**
1. Orchestrator selects fallback TTS model
2. Pre-recorded audio for critical content
3. Graceful degradation

**Payment service down:**
1. Show staff override UI
2. Manual unlock code entry
3. Queue payment for later processing

### Timeout Handling

**Payment timeout (5 minutes):**
1. Send payment_error to kiosk
2. Offer retry option
3. Log for manual reconciliation

---

## Security Architecture

### Authentication

- **Kiosk → LiveKit:** Short-lived JWT (1 hour max)
- **Orchestrator → Services:** Service account keys
- **PSP webhooks:** HMAC verification

### Authorization

- Kiosk sessions bound to kiosk_id
- Payment sessions bound to session_id
- Rate limiting per kiosk_id

### Data Protection

- TLS mandatory for all external communication
- No PII stored (only transaction IDs)
- Payment confirmations signed with HMAC
- Webcam frames processed locally only

### Secrets Management

- Google Secret Manager (or equivalent)
- Environment variables injected at runtime
- No secrets in code or logs

---

## Monitoring & Observability

### Metrics

**Audio Latency:**
- First-frame latency (P50, P95, P99)
- End-to-end latency (request → first audio)

**Image Sync:**
- Sync accuracy (ms deviation from playout_ts)
- Cache hit ratio
- Preload success rate

**Payment:**
- Payment success rate
- Confirmation latency (PSP webhook → kiosk)
- Timeout rate

**System:**
- WebRTC connection failures
- DataChannel message loss
- Service uptime

### Logging

- Structured JSON logs
- Correlation IDs (session_id, payment_id)
- Log levels: ERROR, WARN, INFO, DEBUG

### Alerting

- Audio latency > 500ms (P95)
- Payment success rate < 95%
- WebRTC connection failure rate > 10%
- Service error rate > 1%

---

## Scalability Considerations

### Current Design (MVP)

- 1-10 concurrent kiosks
- Single region deployment
- Stateless services (Cloud Run auto-scaling)

### Future Scaling (Production)

- 100+ concurrent kiosks
- Multi-region deployment (CDN + LiveKit nodes)
- Redis for session state (instead of in-memory)
- Horizontal scaling of all services
- Database for payment audit logs

---

## Technology Choices

### Why LiveKit?

- Production-grade WebRTC SFU
- Server-side track injection support
- DataChannel relay built-in
- Good documentation and SDKs

### Why Cloud Run?

- Serverless (pay per use)
- Auto-scaling (0-N instances)
- Fast cold starts (<1s)
- Easy deployment (gcloud run deploy)

### Why MediaPipe?

- Lightweight and fast
- CPU-only mode available
- Well-supported hand tracking
- Runs in browser (no server dependency)

### Why Razorpay/Cashfree?

- Fast onboarding (sandbox in minutes)
- Reliable webhooks
- UPI support built-in
- Good documentation

---

## Deployment Architecture

```
Internet
   │
   ├─ Kiosk (on-premise Electron app)
   │   ├─ WebRTC connection → LiveKit Cloud
   │   └─ REST API → Cloud Run (Orchestrator)
   │
   ├─ LiveKit Cloud (or self-hosted)
   │   └─ WebRTC SFU
   │
   └─ Google Cloud Platform
       ├─ Cloud Run
       │   ├─ Orchestrator
       │   ├─ Image Screener
       │   └─ Payment Backend
       │
       ├─ Cloud Storage + CDN
       │   └─ Images
       │
       ├─ Secret Manager
       │   └─ API keys, secrets
       │
       └─ Cloud Logging/Monitoring
           └─ Logs, metrics, traces
```

---

## Cost Optimization

### Development

- Use LiveKit free tier (50GB/month)
- Cloud Run free tier (2M requests/month)
- Cloud Storage free tier (5GB)
- Total: ~$0-10/month

### Production (10 kiosks)

- LiveKit Cloud: ~$50-100/month
- Cloud Run: ~$10-20/month
- Cloud Storage + CDN: ~$5-10/month
- PSP fees: 2-3% per transaction
- Total: ~$65-130/month + transaction fees

---

## Future Enhancements

1. **Multi-language support** - TTS in multiple languages
2. **Content CMS** - Admin UI for managing images and scripts
3. **Analytics dashboard** - User engagement metrics
4. **A/B testing** - Test different narration styles
5. **Offline mode** - Full local cache for network outages
6. **Google Earth integration** - 3D map navigation
7. **Voice commands** - Speech recognition for interaction
8. **QR code tours** - Generate custom tour QR codes
