# Infrastructure

Deployment configurations and infrastructure as code for the kiosk project.

## Directory Structure

```
infra/
├── cloud-run/          # Cloud Run deployment configs
├── terraform/          # Terraform IaC (optional)
├── docker/             # Dockerfiles for services
└── scripts/            # Deployment scripts
```

## Services

### Cloud Run Services

1. **orchestrator** - Session management and LiveKit coordination
2. **image-screener** - CDN warming and image preprocessing
3. **mock-tts** - Mock TTS for testing (dev only)
4. **payment-backend** - Payment integration service

### External Services

- **LiveKit** - WebRTC SFU (hosted or self-hosted)
- **Cloud Storage + CDN** - Image hosting
- **PSP** - Razorpay or Cashfree for UPI payments

## Deployment

### Prerequisites

- Google Cloud SDK installed
- Project created on GCP
- Docker installed locally

### Deploy to Cloud Run

```bash
# Set project
gcloud config set project YOUR_PROJECT_ID

# Deploy orchestrator
cd services/orchestrator
gcloud run deploy orchestrator \
  --source . \
  --region us-central1 \
  --allow-unauthenticated

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
  --allow-unauthenticated
```

### Environment Variables

Set environment variables via Cloud Run console or CLI:

```bash
gcloud run services update orchestrator \
  --set-env-vars LIVEKIT_API_KEY=your-key,LIVEKIT_API_SECRET=your-secret
```

## LiveKit Setup

### Option 1: LiveKit Cloud (Recommended for MVP)

1. Sign up at https://livekit.io
2. Create project and get API credentials
3. Use hosted URL

### Option 2: Self-hosted

Deploy LiveKit server:

```bash
docker run -d \
  --name livekit \
  -p 7880:7880 \
  -p 7881:7881 \
  -v $PWD/livekit.yaml:/livekit.yaml \
  livekit/livekit-server \
  --config /livekit.yaml
```

## CDN Setup

### Cloud Storage + Cloud CDN

```bash
# Create bucket
gsutil mb gs://kiosk-images-YOUR_PROJECT

# Enable public access
gsutil iam ch allUsers:objectViewer gs://kiosk-images-YOUR_PROJECT

# Enable Cloud CDN (via Load Balancer console)
```

## Monitoring

### Cloud Logging

View logs:
```bash
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

### Metrics

- Audio latency (P50, P95, P99)
- Image preload time
- Payment success rate
- WebRTC connection failures

## Cost Estimates

- Cloud Run: ~$10-20/month (with generous free tier)
- LiveKit Cloud: ~$50-100/month (based on usage)
- Cloud Storage + CDN: ~$5-10/month (for 1GB + bandwidth)
- PSP fees: 2-3% per transaction

Total: ~$65-130/month for development/testing
