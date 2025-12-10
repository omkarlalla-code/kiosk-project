# Greek Civilization Kiosk - Real-time Speech + Image MVP

Interactive kiosk system featuring real-time TTS narration synchronized with images, gesture control, and UPI payment integration.

## Overview

This project is a production-grade proof-of-concept for an event kiosk that delivers immersive experiences about Greek civilization through:

- **Streaming TTS Audio** - Low-latency text-to-speech with WebRTC delivery
- **Synchronized Images** - CDN-hosted images displayed in sync with audio narrative
- **Gesture Control** - MediaPipe-powered hand gesture recognition
- **UPI Payments** - Secure payment integration for unlocking content

## Architecture

```
┌─────────────────┐
│  Kiosk Client   │ (Electron + WebRTC)
│  - LiveKit      │
│  - MediaPipe    │
│  - Image Sync   │
└────────┬────────┘
         │ WebRTC + DataChannel
         │
┌────────┴────────┐
│   LiveKit SFU   │ (WebRTC Server)
└────────┬────────┘
         │
┌────────┴────────────┐
│   Orchestrator      │ (Cloud Run)
│  - Session Mgmt     │
│  - Token Issuance   │
│  - TTS Coordination │
│  - Payment Sessions │
└──┬──────────┬───────┘
   │          │
   │          └──────────────┐
   │                         │
┌──┴─────────────┐  ┌────────┴──────────┐  ┌──────────────────┐
│ Image Screener │  │ Payment Backend   │  │   TTS Service    │
│ - CDN Warming  │  │ - UPI Integration │  │ - Streaming TTS  │
│ - Preloading   │  │ - Webhooks        │  │ - Control Msgs   │
└────────────────┘  └───────────────────┘  └──────────────────┘
```

## Repository Structure

```
kiosk-project/
├── frontend/
│   └── kiosk/              # Electron kiosk client
│       ├── electron/       # Electron main process
│       ├── src/            # Renderer process
│       │   ├── livekit-client.js
│       │   ├── image-scheduler.js
│       │   ├── gesture-controller.js
│       │   └── payment-ui.js
│       └── package.json
│
├── services/
│   ├── orchestrator/       # Session & coordination service
│   ├── image-screener/     # CDN warming & image preprocessing
│   ├── mock-tts/           # Mock TTS for testing
│   └── payment-backend/    # UPI payment integration
│
├── infra/                  # Infrastructure & deployment
│   ├── cloud-run/
│   ├── terraform/
│   └── docker/
│
├── docs/                   # Documentation
│   ├── protocol.md         # Message schemas & protocol
│   ├── architecture.md     # Architecture details
│   └── runbook.md          # Operations runbook
│
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for local services)
- Google Cloud SDK (for deployment)
- LiveKit account (or self-hosted instance)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd kiosk-project

# Install orchestrator
cd services/orchestrator
npm install

# Install image-screener
cd ../image-screener
npm install

# Install mock-tts
cd ../mock-tts
npm install

# Install payment-backend
cd ../payment-backend
npm install

# Install kiosk client
cd ../../frontend/kiosk
npm install
```

### 2. Configure Environment

Create `.env` files in each service:

**services/orchestrator/.env**
```
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret
LIVEKIT_URL=wss://your-livekit-url
TTS_SERVICE_URL=http://localhost:3002
IMAGE_SCREENER_URL=http://localhost:3001
PAYMENT_BACKEND_URL=http://localhost:3003
```

**services/payment-backend/.env**
```
PSP_PROVIDER=razorpay
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret
PAYMENT_SIGN_SECRET=your-secret-key
WEBHOOK_SECRET=your-webhook-secret
```

**frontend/kiosk/.env**
```
VITE_ORCHESTRATOR_URL=http://localhost:3000
VITE_LIVEKIT_URL=wss://your-livekit-url
```

### 3. Run Services Locally

```bash
# Terminal 1 - Orchestrator
cd services/orchestrator
npm run dev

# Terminal 2 - Image Screener
cd services/image-screener
npm run dev

# Terminal 3 - Mock TTS (for testing)
cd services/mock-tts
npm run dev

# Terminal 4 - Payment Backend
cd services/payment-backend
npm run dev

# Terminal 5 - Kiosk Client
cd frontend/kiosk
npm run dev
```

### 4. Access the Application

- Kiosk client: Electron window opens automatically
- Orchestrator: http://localhost:3000/health
- Image Screener: http://localhost:3001/health
- Mock TTS: http://localhost:3002/health
- Payment Backend: http://localhost:3003/health

## Key Features

### Real-time Audio Synchronization

- WebRTC audio streaming via LiveKit (Opus codec)
- Sub-300ms first-audio latency target
- Playout timestamp-based synchronization

### Image Display

- CDN-hosted images with edge warming
- Crossfade transitions (400ms default)
- LRU cache with TTL management
- Fallback image pack for offline scenarios

### Gesture Control

- MediaPipe hand tracking (5-10 FPS, CPU mode)
- Debounced gesture recognition (500ms)
- Local actions: next, prev, pause
- Server-triggered actions via DataChannel

### UPI Payment Integration

- Razorpay/Cashfree PSP integration
- QR code + deep link support
- Webhook-based confirmation
- HMAC-signed payment verification

## Message Protocol

### Control Messages (DataChannel)

**Image Preload:**
```json
{
  "type": "img_preload",
  "id": "parthenon_overview",
  "cdn_url": "https://cdn/.../parthenon.webp",
  "playout_ts": 1690000000000,
  "ttl_ms": 8000
}
```

**Image Show:**
```json
{
  "type": "img_show",
  "id": "parthenon_overview",
  "playout_ts": 1690000000500,
  "transition": "crossfade",
  "duration_ms": 400,
  "caption": "Parthenon — Athens",
  "credit": "Photo: ..."
}
```

**Payment Request:**
```json
{
  "type": "request_payment",
  "amount": 100,
  "currency": "INR",
  "context": "unlock_tour_x",
  "session_id": "s123"
}
```

See [docs/protocol.md](docs/protocol.md) for complete message schemas.

## Development Timeline

### Day 0 - Prep & Provisioning (4-6h)
- ✅ Repo scaffold
- Provision LiveKit, Cloud Run, Cloud Storage
- Document protocol

### Day 1 - Signaling & Basic Client (8h)
- Gateway token issuance
- Kiosk WebRTC connection
- DataChannel setup

### Day 2 - Mock TTS + Audio Injection (8-10h)
- Mock TTS streaming
- Server-side audio injection
- Mock payment gateway

### Day 3 - Frontend Image Sync + Payment UI (8h)
- Image scheduler with playout_ts
- Crossfade renderer
- Payment QR display

### Day 4 - ImageScreener + PSP Integration (8h)
- CDN warming service
- Razorpay/Cashfree sandbox
- Webhook handling

### Day 5 - Real TTS + Opus Pipeline (8-10h)
- Managed streaming TTS
- PCM→Opus transcoding
- LiveKit injection

### Day 6 - Gesture Control + Edge Cases (8h)
- MediaPipe integration
- Google Earth navigation
- Payment edge cases

### Day 7 - Hardening & Demo (6-8h)
- Resilience tests
- Metrics & logging
- Runbook documentation
- Demo recording

## Performance Targets

- **Audio Latency:** First frame < 300ms
- **Image Sync:** ±50ms (goal), ±100ms (degraded)
- **Payment Confirmation:** < 15s (sandbox)
- **Gesture Recognition:** 250-500ms debounce

## Target Hardware

- **CPU:** i5 13th gen (or equivalent)
- **RAM:** 16GB
- **OS:** Fedora Linux / Windows / macOS
- **Display:** 1920x1080 fullscreen

## Deployment

Deploy to Google Cloud Run:

```bash
# Deploy all services
./infra/scripts/deploy-all.sh

# Or deploy individually
cd services/orchestrator
gcloud run deploy orchestrator --source .
```

See [infra/README.md](infra/README.md) for detailed deployment instructions.

## Testing

### Unit Tests
```bash
cd services/orchestrator
npm test
```

### Integration Tests
```bash
# Start all services, then:
npm run test:integration
```

### Manual Testing
1. Start mock TTS service
2. Connect kiosk client
3. Trigger narration
4. Verify audio+image sync
5. Test gesture controls
6. Test payment flow with mock gateway

## Documentation

- [Protocol Specification](docs/protocol.md) - Message schemas and flows
- [Architecture Guide](docs/architecture.md) - System design details
- [Operations Runbook](docs/runbook.md) - Deployment and troubleshooting
- [Development Plan](docs/development-plan.md) - 7-day timeline

## Security Considerations

- Short-lived JWT tokens for kiosk sessions
- HMAC-signed payment confirmations
- TLS mandatory for all services
- No raw webcam frame uploads
- Rate limiting on payment sessions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT

## Support

For issues or questions:
- GitHub Issues: [Link to your repo issues]
- Documentation: [docs/](docs/)
- Runbook: [docs/runbook.md](docs/runbook.md)
