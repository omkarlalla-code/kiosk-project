# Orchestrator Service

Cloud Run service for session management, LiveKit coordination, and control flow.

## Responsibilities

- Issue LiveKit tokens for kiosk clients
- Manage WebRTC sessions
- Coordinate TTS streaming
- Route control messages (img_preload, img_show) via DataChannel
- Create and manage payment sessions
- Handle PSP webhooks for payment confirmation

## API Endpoints

### Session Management
- `POST /start_session` - Create LiveKit session and return token
- `GET /health` - Health check

### Payment
- `POST /payments/start` - Create payment session
- `POST /webhooks/payment` - Receive PSP webhook callbacks

### Streaming
- `WS /stream` - WebSocket for TTS audio and control messages

## Environment Variables

```
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=
TTS_SERVICE_URL=
IMAGE_SCREENER_URL=
PSP_API_KEY=
PSP_WEBHOOK_SECRET=
```

## Development

```bash
npm install
npm run dev
```

## Deployment

Deploy to Cloud Run:
```bash
gcloud run deploy orchestrator --source .
```
