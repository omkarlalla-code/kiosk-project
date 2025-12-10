# Quick Start Guide

Get the kiosk project running locally in 15 minutes.

## Prerequisites

- Node.js 18+ installed
- Google Cloud SDK installed (for deployment)
- Git (for version control)
- LiveKit account (free tier works)

## Step 1: Install Dependencies (5 min)

```bash
# Install all service dependencies
npm run install:all

# Or install individually:
cd services/orchestrator && npm install
cd ../image-screener && npm install
cd ../mock-tts && npm install
cd ../payment-backend && npm install
cd ../../frontend/kiosk && npm install
```

## Step 2: Configure Environment (3 min)

### Get LiveKit Credentials

1. Sign up at https://livekit.io
2. Create a project
3. Copy API Key and API Secret

### Create Environment Files

**services/orchestrator/.env:**
```env
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_URL=wss://your-project.livekit.cloud
TTS_SERVICE_URL=http://localhost:3002
IMAGE_SCREENER_URL=http://localhost:3001
PAYMENT_BACKEND_URL=http://localhost:3003
```

**services/payment-backend/.env:**
```env
PSP_PROVIDER=mock
PAYMENT_SIGN_SECRET=test-secret-key-123
WEBHOOK_SECRET=test-webhook-secret-456
```

**frontend/kiosk/.env:**
```env
VITE_ORCHESTRATOR_URL=http://localhost:3000
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

## Step 3: Start Services (2 min)

Open 5 terminal windows:

**Terminal 1 - Orchestrator:**
```bash
npm run dev:orchestrator
```
Wait for: `Orchestrator service listening on port 3000`

**Terminal 2 - Image Screener:**
```bash
npm run dev:image-screener
```
Wait for: `Image Screener service listening on port 3001`

**Terminal 3 - Mock TTS:**
```bash
npm run dev:mock-tts
```
Wait for: `Mock TTS service listening on port 3002`

**Terminal 4 - Payment Backend:**
```bash
npm run dev:payment
```
Wait for: `Payment Backend service listening on port 3003`

**Terminal 5 - Kiosk Client:**
```bash
npm run dev:kiosk
```
Wait for Electron window to open

## Step 4: Verify Setup (2 min)

### Check Service Health

```bash
# All should return {"status":"ok"}
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### Test Kiosk Connection

1. Kiosk window should open automatically
2. Check status indicator in top-right
3. Should say "Connected" within a few seconds
4. Open DevTools (Ctrl+Shift+I) to see console logs

## Step 5: Test Basic Flow (3 min)

### Test Mock TTS Stream

The mock TTS service is ready but needs implementation. For now, verify:

1. Kiosk is connected (status = "Connected")
2. No errors in console
3. WebSocket connection established (check DevTools → Network → WS)

### Test Payment UI (Mock Mode)

Since payment backend is in mock mode, you can trigger a test payment:

1. In kiosk DevTools console, run:
```javascript
// Simulate payment request
window.postMessage({
  type: 'payment_ready',
  payment_id: 'test_123',
  upi_uri: 'upi://pay?pa=test@upi',
  qr_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  amount: 100,
  currency: 'INR'
}, '*');
```

2. Payment modal should appear with QR code
3. Test payment confirmation:
```javascript
window.postMessage({
  type: 'payment_confirm',
  payment_id: 'test_123',
  status: 'success',
  txn_id: 'txn_abc',
  signature: 'test_signature'
}, '*');
```

4. Modal should show success and close

## Common Issues

### Port Already in Use

If you get "port already in use" error:

```bash
# Find process using port (Linux/Mac)
lsof -i :3000

# Find process using port (Windows)
netstat -ano | findstr :3000

# Kill process
kill -9 <PID>  # Linux/Mac
taskkill /F /PID <PID>  # Windows
```

### Kiosk Won't Connect

1. Check all services are running (curl health endpoints)
2. Verify LiveKit credentials in orchestrator/.env
3. Check browser console for errors
4. Ensure VITE_LIVEKIT_URL matches your LiveKit project

### "Module not found" Errors

```bash
# Clear and reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. **Implement Mock TTS streaming** - See `services/mock-tts/README.md`
2. **Add test images** - Upload to Cloud Storage and configure CDN
3. **Test gesture control** - Enable webcam and test MediaPipe
4. **Integrate real PSP** - Sign up for Razorpay sandbox
5. **Deploy to Cloud Run** - See `infra/README.md`

## Development Workflow

### Making Changes

1. Edit code in your preferred editor
2. Services auto-reload on changes (nodemon)
3. Kiosk auto-reloads on changes (Vite HMR)
4. Check console/logs for errors

### Adding New Features

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Commit: `git commit -m "Add my feature"`
4. Push and create PR

### Testing

```bash
# Run unit tests
npm test

# Run specific service tests
cd services/orchestrator
npm test
```

## Useful Commands

```bash
# Stop all services (Ctrl+C in each terminal)

# View logs
# (Check each terminal window)

# Reset everything
git clean -fdx  # ⚠️ Removes all untracked files!
npm run install:all

# Deploy to production
./infra/scripts/deploy-all.sh your-project-id us-central1
```

## Resources

- **LiveKit Docs**: https://docs.livekit.io
- **MediaPipe Docs**: https://google.github.io/mediapipe
- **Razorpay Docs**: https://razorpay.com/docs
- **Cloud Run Docs**: https://cloud.google.com/run/docs

## Getting Help

- Check `docs/` for detailed documentation
- Review `docs/runbook.md` for troubleshooting
- Open an issue on GitHub
- Check service logs in terminal windows

---

**Estimated total time: 15 minutes**

Ready to build something awesome! 🚀
