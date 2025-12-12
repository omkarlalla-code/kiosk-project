# Local Development Setup

This guide covers running the entire system locally for development and testing.

## Prerequisites

- Node.js 18+ and npm
- LiveKit account (free tier available at https://livekit.io)
- Windows/Mac/Linux

## Quick Start

### 1. Install Dependencies

```bash
npm run install:all
```

This installs dependencies for all services and the frontend.

### 2. Configure Environment Variables

Create `.env` files for each service:

**services/orchestrator/.env:**
```env
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here
LIVEKIT_URL=wss://your-project.livekit.cloud
TTS_SERVICE_URL=http://localhost:3002
IMAGE_SCREENER_URL=http://localhost:3001
PORT=3000
```

**services/payment-backend/.env:**
```env
PORT=3003
PSP_PROVIDER=mock
PAYMENT_SIGN_SECRET=dev-secret-key
ORCHESTRATOR_URL=http://localhost:3000
```

**frontend/kiosk/.env:**
```env
VITE_ORCHESTRATOR_URL=http://localhost:3000
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
VITE_KIOSK_ID=kiosk-001
VITE_DEBUG=true
```

### 3. Start Services

Open 4 separate terminals:

**Terminal 1 - Orchestrator:**
```bash
cd services/orchestrator
npm run dev
```
Runs on http://localhost:3000

**Terminal 2 - Mock TTS:**
```bash
cd services/mock-tts
npm start
```
Runs on http://localhost:3002 (WebSocket available at ws://localhost:3002)

**Terminal 3 - Payment Backend:**
```bash
cd services/payment-backend
npm start
```
Runs on http://localhost:3003

**Terminal 4 - Kiosk Frontend:**
```bash
cd frontend/kiosk
npm run dev
```
Runs on http://localhost:5173

## Service Ports

| Service | Port | Protocol |
|---------|------|----------|
| Orchestrator | 3000 | HTTP |
| Image Screener | 3001 | HTTP (not implemented yet) |
| Mock TTS | 3002 | HTTP + WebSocket |
| Payment Backend | 3003 | HTTP |
| Kiosk Frontend | 5173 | HTTP |

## API Endpoints

### Orchestrator (Port 3000)

- `GET /health` - Health check
- `POST /start_session` - Create LiveKit session and issue token
  ```json
  {
    "kiosk_id": "kiosk-001"
  }
  ```
- `GET /session/:session_id` - Get session info
- `DELETE /session/:session_id` - End session
- `GET /sessions` - List all active sessions

### Mock TTS (Port 3002)

- `GET /health` - Health check
- `WS /` - WebSocket endpoint for streaming

WebSocket message to start stream:
```json
{
  "type": "start_stream",
  "session_id": "test-session",
  "topic": "greek_civilization",
  "mode": "normal"
}
```

### Payment Backend (Port 3003)

- `GET /health` - Health check
- `POST /create_session` - Create UPI payment session
  ```json
  {
    "amount": 50000,
    "currency": "INR",
    "context": "greek_civilization",
    "session_id": "session_xxx",
    "kiosk_id": "kiosk-001"
  }
  ```
- `GET /status/:payment_id` - Check payment status
- `POST /mock/complete_payment/:payment_id` - Simulate payment completion (testing only)
- `GET /sessions` - List all payment sessions

## Testing

### Test Orchestrator Session Creation

```powershell
cd services/orchestrator
.\test-session.ps1
```

### Test Mock TTS Streaming

```bash
cd services/mock-tts
node test-client.js
```

### Test Payment Flow

```powershell
cd services/payment-backend
.\test-payment.ps1
```

## Troubleshooting

### Port Already in Use

If you see `EADDRINUSE` errors:

**Windows:**
```bash
# Find process using port 3002
netstat -ano | findstr :3002

# Kill process by PID
taskkill /F /PID <PID>
```

**Mac/Linux:**
```bash
# Find and kill process
lsof -ti:3002 | xargs kill -9
```

### LiveKit Connection Issues

1. Verify your LiveKit credentials in `.env` files
2. Check that LIVEKIT_URL uses `wss://` prefix
3. Ensure your LiveKit project is active (free tier available)

### WebSocket Connection Failed

1. Ensure Mock TTS service is running on port 3002
2. Check firewall settings
3. Verify WebSocket URL: `ws://localhost:3002`

## Development Workflow

1. Start all backend services (orchestrator, mock-tts, payment-backend)
2. Start the kiosk frontend
3. Open browser to http://localhost:5173
4. Use test scripts to verify each service independently

## Next Steps

- Implement Image Screener service (Port 3001)
- Integrate LiveKit SDK in kiosk frontend
- Add MediaPipe gesture control
- Deploy to cloud (see PROVISIONING_GUIDE.md)
