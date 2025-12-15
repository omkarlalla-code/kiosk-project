# Cost Optimization Guide

This guide documents the cost optimization strategies implemented in the kiosk project based on cost analysis.

## 1. TTS Audio Caching ✅ Implemented

**Problem**: Generating the same narration repeatedly for different sessions wastes TTS API costs.

**Solution**: Implemented file-based caching in `services/real-tts/src/index.js`

### How it works:
- Audio is generated once and saved to `cache/tts/` directory
- Cache key is SHA-256 hash of narration text
- Subsequent requests serve from cache instead of regenerating
- Reduces TTS costs by ~90% for repeated content

### Configuration:
```env
# In services/real-tts/.env
ENABLE_TTS_CACHE=true  # Enable/disable caching (default: true)
```

### Cache Storage Options:

#### Development/Testing (Current):
- **Local file system** (`cache/tts/`)
- Simple, no additional setup
- Cache lost on container restart

#### Production (Recommended):
```bash
# Option 1: Google Cloud Storage (Recommended)
# Mount GCS bucket to container
gcloud run services update kiosk-real-tts \
  --add-volume name=tts-cache,type=cloud-storage,bucket=kiosk-tts-cache \
  --add-volume-mount volume=tts-cache,mount-path=/app/cache

# Option 2: Cloud Filestore (More expensive, lower latency)
# Use for high-throughput scenarios only
```

**Cost Impact**:
- First narration: ~$0.016 (16KB text × $0.000016/char)
- Cached narration: $0 (served from storage)
- Storage cost: ~$0.02/GB/month (GCS Standard)

---

## 2. Session Management & Cleanup ✅ Implemented

**Problem**: Lingering LiveKit sessions accumulate unnecessary costs.

**Solution**: Automatic session timeouts and cleanup in `services/orchestrator/src/index.js`

### Features:
- **Auto-timeout**: Sessions end after 10 minutes of inactivity
- **Periodic cleanup**: Removes old session records every minute
- **LiveKit room deletion**: Ensures WebRTC resources are released
- **Activity tracking**: Session timeout refreshes on user actions

### Configuration:
```env
# In services/orchestrator/.env
SESSION_TIMEOUT_MS=600000          # 10 minutes (default)
SESSION_CLEANUP_INTERVAL_MS=60000  # 1 minute (default)
```

### Monitoring:
```bash
# Check active sessions
curl http://localhost:3000/health
# Response: {"status":"ok","active_sessions":0,"total_sessions":0}

# End session manually
curl -X DELETE http://localhost:3000/session/{session_id}
```

**Cost Impact**:
- Before: Sessions could linger for hours
- After: Max session duration = 10 min inactivity timeout
- LiveKit cost reduction: ~80-90%

---

## 3. Cloud Run Scaling to Zero ✅ Configured

**Problem**: Idle Cloud Run instances during kiosk downtime (e.g., overnight) still incur costs.

**Solution**: Cloud Run YAML configurations with `minScale: 0`

### Configuration Files:
- `services/orchestrator/cloudrun.yaml`
- `services/real-tts/cloudrun.yaml`

### Key Settings:
```yaml
annotations:
  autoscaling.knative.dev/minScale: "0"      # Scale to zero when idle
  autoscaling.knative.dev/maxScale: "10"     # Max instances limit
  run.googleapis.com/cpu-throttling: "true"  # CPU only during requests
  run.googleapis.com/startup-cpu-boost: "true" # Faster cold starts
```

### Trade-offs:
- **Cold Start Delay**: First request after idle period takes 1-3 seconds
- **Acceptable for**: Kiosk applications where user initiates interaction
- **Not suitable for**: Real-time, latency-critical applications

### Deployment:
```bash
# Deploy orchestrator with scaling config
gcloud run services replace services/orchestrator/cloudrun.yaml \
  --region=us-central1

# Deploy real-tts with scaling config
gcloud run services replace services/real-tts/cloudrun.yaml \
  --region=us-central1
```

**Cost Impact**:
- Before: 24/7 running = $43.80/month (1 instance × 1 vCPU × 512MB)
- After: 8 hours/day active = $11.68/month (~73% savings)
- Overnight savings: ~16 hours/day × 30 days = 480 hours/month

---

## 4. Image Optimization ⚠️ To Verify

**Problem**: Unoptimized images increase CDN bandwidth costs.

**Current State**:
- README.md mentions WebP format usage ✅
- Image-screener service exists for validation ✅

**Action Required**: Verify implementation in `services/image-screener/`

### Checklist:
- [ ] Confirm WebP format enforcement
- [ ] Verify image compression quality settings
- [ ] Check maximum image dimensions
- [ ] Test CDN cache headers (Cache-Control, max-age)

### Recommended Settings:
```javascript
// Image optimization targets
{
  format: 'webp',
  quality: 80,           // 80% quality (visual quality vs size)
  maxWidth: 1920,        // 1080p display max
  maxHeight: 1080,
  compression: 'lossy'
}
```

**Expected Cost Impact**:
- WebP vs JPEG: ~30% smaller file size
- CDN bandwidth reduction: ~30%
- Current cost: Low ($0.08/GB egress)
- Optimization: Prevents future scaling issues

---

## 5. Additional Recommendations

### 5.1 Use Cloud Storage for TTS Cache
```bash
# Create GCS bucket for TTS cache
gsutil mb -l us-central1 gs://kiosk-tts-cache

# Set lifecycle policy (delete files older than 30 days)
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {"age": 30}
    }]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://kiosk-tts-cache
```

### 5.2 Monitor Session Metrics
```bash
# Add Cloud Monitoring custom metrics
gcloud logging metrics create active_sessions \
  --description="Number of active kiosk sessions" \
  --log-filter='resource.type="cloud_run_revision"
    AND jsonPayload.message=~"Created session"'
```

### 5.3 Set Budget Alerts
```bash
# Create budget alert at $50/month
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="Kiosk Monthly Budget" \
  --budget-amount=50USD \
  --threshold-rule=percent=80 \
  --threshold-rule=percent=100
```

---

## Cost Summary

| Optimization | Status | Monthly Savings | Implementation |
|-------------|--------|----------------|----------------|
| TTS Caching | ✅ Implemented | ~$40-80 | Automatic |
| Session Cleanup | ✅ Implemented | ~$20-40 | Automatic |
| Scale to Zero | ✅ Configured | ~$30-60 | Needs deployment |
| Image Optimization | ⚠️ To Verify | ~$5-10 | Needs review |
| **Total Estimated Savings** | | **~$95-190/month** | |

## Next Steps

1. **Deploy Cloud Run configurations**:
   ```bash
   # Update placeholder values in cloudrun.yaml files
   # Then deploy:
   ./deploy.sh
   ```

2. **Verify image-screener service** for WebP optimization

3. **Set up GCS bucket** for TTS cache in production

4. **Enable Cloud Monitoring** for session metrics

5. **Create budget alerts** to track spending

6. **Test cold start performance** to ensure acceptable UX

---

## Monitoring Dashboard

Track optimization effectiveness:

```bash
# View session metrics
curl http://localhost:3000/health

# Check TTS cache hit rate
# (Monitor log messages for "Serving cached audio" vs "Generating new TTS")

# View Cloud Run metrics
gcloud run services describe kiosk-orchestrator \
  --region=us-central1 \
  --format='value(status.traffic[0].percent)'
```
