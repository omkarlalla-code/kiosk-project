# Project Structure

Complete file structure of the kiosk project repository.

```
kiosk-project/
│
├── .gitignore                          # Git ignore rules
├── README.md                           # Main project documentation
├── package.json                        # Root package.json with convenience scripts
├── PROJECT_STRUCTURE.md                # This file
│
├── docs/                               # Documentation
│   ├── protocol.md                     # Message schemas and protocol spec
│   ├── architecture.md                 # System architecture documentation
│   └── runbook.md                      # Operations runbook
│
├── frontend/                           # Frontend applications
│   └── kiosk/                          # Electron kiosk client
│       ├── electron/                   # Electron main process
│       │   ├── main.js                 # Electron main entry point
│       │   └── preload.js              # Preload script for IPC
│       ├── src/                        # Renderer process source
│       │   ├── main.js                 # Main application logic
│       │   ├── livekit-client.js       # LiveKit WebRTC client wrapper
│       │   ├── image-scheduler.js      # Image sync and rendering
│       │   ├── gesture-controller.js   # MediaPipe gesture recognition
│       │   ├── payment-ui.js           # Payment QR and confirmation UI
│       │   └── styles/                 # CSS styles
│       │       └── main.css            # Main stylesheet
│       ├── index.html                  # HTML entry point
│       ├── vite.config.js              # Vite configuration
│       ├── package.json                # Dependencies
│       └── README.md                   # Kiosk client documentation
│
├── services/                           # Backend services
│   │
│   ├── orchestrator/                   # Main orchestration service
│   │   ├── src/
│   │   │   └── index.js                # Express server
│   │   ├── package.json                # Dependencies
│   │   └── README.md                   # Service documentation
│   │
│   ├── image-screener/                 # CDN warming and image preprocessing
│   │   ├── src/
│   │   │   └── index.js                # Express server with Sharp
│   │   ├── package.json                # Dependencies
│   │   └── README.md                   # Service documentation
│   │
│   ├── mock-tts/                       # Mock TTS for testing
│   │   ├── src/
│   │   │   └── index.js                # WebSocket server
│   │   ├── package.json                # Dependencies
│   │   └── README.md                   # Service documentation
│   │
│   └── payment-backend/                # UPI payment integration
│       ├── src/
│       │   └── index.js                # Payment and webhook handling
│       ├── package.json                # Dependencies
│       └── README.md                   # Service documentation
│
└── infra/                              # Infrastructure and deployment
    ├── scripts/                        # Deployment scripts
    │   ├── deploy-all.sh               # Deploy all services (bash)
    │   └── deploy-all.bat              # Deploy all services (Windows)
    ├── cloud-run/                      # Cloud Run configs (future)
    ├── terraform/                      # Terraform IaC (future)
    ├── docker/                         # Dockerfiles (future)
    └── README.md                       # Infrastructure documentation
```

## Service Ports (Local Development)

- **Orchestrator**: 3000
- **Image Screener**: 3001
- **Mock TTS**: 3002
- **Payment Backend**: 3003
- **Kiosk Client**: 5173 (Vite dev server)

## Key Files

### Configuration
- `frontend/kiosk/.env` - Kiosk client environment variables
- `services/*/package.json` - Service dependencies

### Documentation
- `README.md` - Project overview and quick start
- `docs/protocol.md` - Complete message protocol specification
- `docs/architecture.md` - Architecture deep dive
- `docs/runbook.md` - Operations and troubleshooting

### Entry Points
- `frontend/kiosk/electron/main.js` - Electron main process
- `frontend/kiosk/src/main.js` - Kiosk renderer application
- `services/orchestrator/src/index.js` - Orchestrator service
- `services/image-screener/src/index.js` - Image screener service
- `services/mock-tts/src/index.js` - Mock TTS service
- `services/payment-backend/src/index.js` - Payment backend service

## Next Steps

1. **Initialize Git repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial scaffold"
   ```

2. **Install dependencies:**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables:**
   - Create `.env` files in each service directory
   - Configure LiveKit, PSP credentials

4. **Start development:**
   ```bash
   # Terminal 1
   npm run dev:orchestrator

   # Terminal 2
   npm run dev:image-screener

   # Terminal 3
   npm run dev:mock-tts

   # Terminal 4
   npm run dev:payment

   # Terminal 5
   npm run dev:kiosk
   ```

## File Counts

- **Total services**: 4 (orchestrator, image-screener, mock-tts, payment-backend)
- **Frontend apps**: 1 (kiosk Electron client)
- **Documentation files**: 4 (README, protocol, architecture, runbook)
- **Configuration files**: 8 (package.json files, gitignore, vite config)
- **Source files**: 10+ (JS/CSS/HTML)

## Technology Stack Summary

**Frontend:**
- Electron (desktop app framework)
- Vite (build tool)
- LiveKit Client SDK (WebRTC)
- MediaPipe (gesture recognition)
- Vanilla JavaScript (no framework)

**Backend:**
- Node.js + Express (all services)
- LiveKit Server SDK (orchestrator)
- Sharp (image processing)
- WebSocket (mock TTS)
- Razorpay/Cashfree SDK (payments)

**Infrastructure:**
- Google Cloud Run (serverless deployment)
- Cloud Storage + CDN (image hosting)
- LiveKit Cloud (WebRTC SFU)
- Secret Manager (credentials)

**Development:**
- Git (version control)
- npm (package management)
- gcloud CLI (deployment)
- Chrome DevTools (debugging)
