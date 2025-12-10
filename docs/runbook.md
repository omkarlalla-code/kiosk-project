# Operations Runbook

Operational procedures for deploying, monitoring, and troubleshooting the kiosk system.

## Table of Contents

1. [Deployment](#deployment)
2. [Monitoring](#monitoring)
3. [Troubleshooting](#troubleshooting)
4. [Incident Response](#incident-response)
5. [Maintenance](#maintenance)
6. [Emergency Procedures](#emergency-procedures)

---

## Deployment

### Prerequisites

- Google Cloud SDK installed and configured
- LiveKit account (or self-hosted instance)
- Razorpay/Cashfree account (sandbox for dev, production for live)
- Node.js 18+ installed locally

### Initial Setup

#### 1. Provision Infrastructure

```bash
# Set GCP project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create Cloud Storage bucket for images
gsutil mb -c STANDARD -l us-central1 gs://kiosk-images-YOUR_PROJECT

# Make bucket public
gsutil iam ch allUsers:objectViewer gs://kiosk-images-YOUR_PROJECT

# Create secrets
echo -n "your-livekit-api-key" | gcloud secrets create livekit-api-key --data-file=-
echo -n "your-livekit-api-secret" | gcloud secrets create livekit-api-secret --data-file=-
echo -n "your-razorpay-key" | gcloud secrets create razorpay-key --data-file=-
echo -n "your-razorpay-secret" | gcloud secrets create razorpay-secret --data-file=-
```

#### 2. Deploy Services

```bash
# Deploy orchestrator
cd services/orchestrator
gcloud run deploy orchestrator \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest

# Deploy image-screener
cd ../image-screener
gcloud run deploy image-screener \
  --source . \
  --region us-central1 \
  --allow-unauthenticated

# Deploy payment-backend
cd ../payment-backend
gcloud run deploy payment-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets RAZORPAY_KEY_ID=razorpay-key:latest,RAZORPAY_KEY_SECRET=razorpay-secret:latest
```

#### 3. Upload Images

```bash
# Upload images to Cloud Storage
gsutil -m cp -r images/* gs://kiosk-images-YOUR_PROJECT/

# Verify upload
gsutil ls gs://kiosk-images-YOUR_PROJECT/
```

#### 4. Configure Kiosk Client

Edit `frontend/kiosk/.env`:

```env
VITE_ORCHESTRATOR_URL=https://orchestrator-xxx.run.app
VITE_LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
```

Build and deploy kiosk client:

```bash
cd frontend/kiosk
npm install
npm run build

# Package for Electron
# (Platform-specific packaging commands)
```

---

## Monitoring

### Health Checks

Check service health:

```bash
# Orchestrator
curl https://orchestrator-xxx.run.app/health

# Image Screener
curl https://image-screener-xxx.run.app/health

# Payment Backend
curl https://payment-backend-xxx.run.app/health
```

Expected response:
```json
{"status":"ok","service":"orchestrator"}
```

### View Logs

```bash
# View orchestrator logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=orchestrator" \
  --limit 50 \
  --format json

# Filter for errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit 20

# Tail logs (real-time)
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=orchestrator"
```

### Key Metrics

**Audio Latency:**
- Target: P95 < 300ms
- Alert threshold: P95 > 500ms

**Image Sync Accuracy:**
- Target: ±50ms
- Alert threshold: ±150ms

**Payment Success Rate:**
- Target: > 95%
- Alert threshold: < 90%

**Service Uptime:**
- Target: 99.9%
- Alert threshold: < 99%

### Dashboard

Create dashboard in Cloud Console:
1. Go to Monitoring → Dashboards
2. Add charts for:
   - Request latency (by service)
   - Error rate (by service)
   - Active connections (LiveKit)
   - Payment success rate

---

## Troubleshooting

### Kiosk Won't Connect

**Symptoms:**
- Kiosk shows "Connecting..." indefinitely
- No audio or images displayed

**Diagnosis:**

1. Check network connectivity:
```bash
# From kiosk machine
ping orchestrator-xxx.run.app
curl https://orchestrator-xxx.run.app/health
```

2. Check LiveKit token:
```bash
# Check orchestrator logs for token generation errors
gcloud logging read "resource.labels.service_name=orchestrator AND textPayload:token" --limit 10
```

3. Verify WebRTC connection:
   - Open Chrome DevTools → Network → WS tab
   - Should see WebSocket connection to LiveKit

**Resolution:**

- If network issue: Fix firewall/proxy settings
- If token issue: Check LiveKit credentials in orchestrator
- If WebRTC issue: Verify LiveKit URL and availability

---

### Audio Playing But Images Not Synced

**Symptoms:**
- Audio plays normally
- Images appear but are out of sync with narration

**Diagnosis:**

1. Check image preload messages:
```bash
# Check orchestrator logs for img_preload messages
gcloud logging read "resource.labels.service_name=orchestrator AND textPayload:img_preload" --limit 20
```

2. Check kiosk console logs:
   - Open DevTools → Console
   - Look for "Preloading image:" and "Scheduling image show:" messages

3. Check CDN latency:
```bash
# Test image load time
curl -w "@curl-format.txt" -o /dev/null -s https://cdn.example.com/images/test.webp
```

**Resolution:**

- If preload messages missing: Fix TTS service or orchestrator routing
- If images loading slowly: Warm CDN cache via ImageScreener
- If timing issues: Adjust playout_ts calculation or add buffer

---

### Payment Not Working

**Symptoms:**
- QR code not displaying
- Payment stuck in "Waiting..." state
- Payment successful but content not unlocking

**Diagnosis:**

1. Check payment backend logs:
```bash
gcloud logging read "resource.labels.service_name=payment-backend" --limit 30
```

2. Verify PSP webhook delivery:
   - Check PSP dashboard for webhook attempts
   - Look for failed webhook deliveries

3. Check signature verification:
   - Look for "Invalid signature" errors in kiosk console

**Resolution:**

- If QR not showing: Check payment backend API and PSP credentials
- If webhook not received: Verify webhook URL in PSP dashboard
- If signature invalid: Check PAYMENT_SIGN_SECRET matches between orchestrator and kiosk

---

### High Audio Latency

**Symptoms:**
- Audio starts >1 second after request
- Choppy or stuttering audio

**Diagnosis:**

1. Check TTS service latency:
```bash
# Check TTS response times in orchestrator logs
gcloud logging read "resource.labels.service_name=orchestrator AND textPayload:TTS" --limit 20
```

2. Check LiveKit connection quality:
   - Check kiosk console for WebRTC stats
   - Look for packet loss or high RTT

3. Check server CPU/memory:
```bash
gcloud run services describe orchestrator --region us-central1
```

**Resolution:**

- If TTS slow: Switch to managed TTS or optimize model
- If LiveKit slow: Check LiveKit server location and scaling
- If server overloaded: Increase Cloud Run instance size or count

---

### Gesture Recognition Not Working

**Symptoms:**
- Gestures not detected
- High CPU usage on kiosk

**Diagnosis:**

1. Check webcam access:
   - Look for camera permission prompt in browser
   - Verify camera is connected and working

2. Check MediaPipe initialization:
   - Open kiosk console
   - Look for "MediaPipe initialized" message

3. Check CPU usage:
```bash
# On kiosk machine (Linux)
top

# On kiosk machine (Windows)
taskmgr
```

**Resolution:**

- If camera denied: Grant camera permissions
- If MediaPipe failed: Check MediaPipe CDN accessibility
- If high CPU: Reduce gesture recognition FPS or resolution

---

## Incident Response

### Severity Levels

**P0 (Critical):**
- All kiosks down
- Payment system completely unavailable
- Data breach or security incident

**P1 (High):**
- >50% of kiosks affected
- Payment success rate < 50%
- Audio/video completely broken

**P2 (Medium):**
- <50% of kiosks affected
- Degraded performance (latency, sync issues)
- Payment delays

**P3 (Low):**
- Isolated issues
- Minor UX problems
- Non-critical features broken

### Response Procedures

#### P0 Incident

1. **Immediate actions:**
   - Page on-call engineer
   - Post incident notice in status page
   - Enable staff override mode for payments

2. **Investigation:**
   - Check service health endpoints
   - Review recent deployments
   - Check cloud provider status

3. **Mitigation:**
   - Rollback recent deployment if needed
   - Scale up services if resource issue
   - Failover to backup region if needed

4. **Communication:**
   - Update stakeholders every 30 minutes
   - Post resolution notice when fixed
   - Schedule post-mortem

#### Staff Override for Payments

If payment system is down, use manual override:

1. On kiosk, press Ctrl+Shift+P to open override UI
2. Enter override code (generated daily, stored in Secret Manager)
3. Manually verify payment on phone
4. Unlock content for user
5. Log override in spreadsheet for reconciliation

---

## Maintenance

### Weekly Tasks

1. **Review logs for errors:**
```bash
gcloud logging read "severity>=ERROR" --limit 100 --format json > errors-$(date +%Y%m%d).json
```

2. **Check payment reconciliation:**
   - Compare PSP dashboard with internal logs
   - Flag discrepancies for investigation

3. **Update image cache:**
   - Upload new images to Cloud Storage
   - Clear CDN cache if needed

### Monthly Tasks

1. **Rotate secrets:**
```bash
# Generate new payment signing secret
echo -n "new-secret-$(openssl rand -hex 32)" | gcloud secrets versions add payment-sign-secret --data-file=-

# Update kiosk clients with new secret
```

2. **Review and optimize:**
   - Analyze latency metrics
   - Optimize slow queries or operations
   - Review and reduce costs

3. **Update dependencies:**
```bash
# Update service dependencies
cd services/orchestrator
npm update
npm audit fix

# Redeploy
gcloud run deploy orchestrator --source .
```

### Quarterly Tasks

1. **Load testing:**
   - Simulate 50+ concurrent kiosks
   - Test payment throughput
   - Verify auto-scaling works

2. **Disaster recovery drill:**
   - Simulate region outage
   - Practice failover procedures
   - Update runbook based on learnings

3. **Security audit:**
   - Review IAM permissions
   - Rotate all secrets
   - Update TLS certificates

---

## Emergency Procedures

### Complete Service Outage

1. Check cloud provider status page
2. Attempt service restart:
```bash
# Redeploy all services
./infra/scripts/deploy-all.sh
```

3. If cloud provider issue, wait for resolution
4. If persistent issue, rollback to last known good deployment:
```bash
gcloud run services update orchestrator --image gcr.io/PROJECT/orchestrator:PREVIOUS_TAG
```

### Data Corruption

1. Stop affected service immediately
2. Restore from backup (if applicable)
3. Investigate root cause
4. Fix and redeploy

### Security Incident

1. Isolate affected systems
2. Rotate all secrets immediately
3. Review audit logs
4. Notify security team
5. Document incident
6. Implement fixes

### Kiosk Hardware Failure

1. Power cycle kiosk
2. Check webcam, display, network connections
3. Re-image kiosk if needed (keep backup image on USB)
4. Contact hardware vendor if persistent

---

## Contact Information

**On-call Engineer:** [Phone number / Slack channel]

**Cloud Provider Support:** [Support link / phone]

**LiveKit Support:** support@livekit.io

**PSP Support:**
- Razorpay: [Support link]
- Cashfree: [Support link]

---

## Useful Commands

```bash
# Quick deploy all services
./infra/scripts/deploy-all.sh

# View all services
gcloud run services list --region us-central1

# Scale service manually
gcloud run services update orchestrator --max-instances 10

# View service configuration
gcloud run services describe orchestrator --region us-central1

# Test payment webhook locally
curl -X POST http://localhost:3003/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -d '{"event":"payment.success","payload":{"payment_id":"test123"}}'

# Clear CDN cache
gcloud compute url-maps invalidate-cdn-cache URL_MAP_NAME --path "/*"
```

---

## Appendix

### Environment Variables Reference

**Orchestrator:**
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret
- `LIVEKIT_URL` - LiveKit WebSocket URL
- `TTS_SERVICE_URL` - TTS service endpoint
- `IMAGE_SCREENER_URL` - Image screener endpoint
- `PAYMENT_BACKEND_URL` - Payment backend endpoint

**Payment Backend:**
- `PSP_PROVIDER` - "razorpay" or "cashfree"
- `RAZORPAY_KEY_ID` - Razorpay API key
- `RAZORPAY_KEY_SECRET` - Razorpay API secret
- `PAYMENT_SIGN_SECRET` - Secret for signing payment confirmations
- `WEBHOOK_SECRET` - Secret for verifying PSP webhooks

**Kiosk Client:**
- `VITE_ORCHESTRATOR_URL` - Orchestrator URL
- `VITE_LIVEKIT_URL` - LiveKit URL

---

Last updated: 2025-12-10
