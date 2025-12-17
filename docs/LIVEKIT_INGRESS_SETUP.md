# LiveKit Ingress Setup Guide

## Overview

LiveKit Ingress allows server-side audio/video publishing to rooms. There are multiple approaches to implement this for the Greek Civilization Kiosk.

## 🎯 Approaches (Ranked by Complexity)

### ✅ Option 1: Browser TTS with DataChannel (Current - WORKING)
**Status**: ✅ **Implemented and functional**

**How it works**:
- Frontend uses Web Speech API for TTS
- Images sync via DataChannel messages from orchestrator
- No server-side audio publishing needed

**Pros**:
- Already working
- No additional setup required
- Simple architecture

**Cons**:
- Browser TTS quality varies
- Limited voice customization

---

### 🚀 Option 2: FFmpeg → RTMP → LiveKit Ingress (Best for Production)
**Status**: ⏳ **Requires FFmpeg installation + LiveKit Ingress**

**Architecture**:
```
TTS Service (PCM) → FFmpeg (Opus encoding) → RTMP → LiveKit Ingress → Room
```

**Requirements**:
1. **FFmpeg** installed on server
2. **LiveKit Server** with Ingress enabled
3. **IngressClient** from livekit-server-sdk

**Setup Steps**:

#### 1. Install FFmpeg
**Windows**:
```powershell
# Download from https://ffmpeg.org/download.html
# Or use Chocolatey:
choco install ffmpeg

# Or use winget:
winget install ffmpeg
```

**Verify**:
```bash
ffmpeg -version
```

#### 2. Enable LiveKit Ingress

**If using LiveKit Cloud**:
- Ingress is automatically enabled
- Use cloud credentials

**If using Local LiveKit Server**:

Create `livekit-server-config.yaml`:
```yaml
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000

redis:
  address: localhost:6379  # Optional: for multi-node setups

keys:
  devkey: secret

room:
  auto_create: true
  empty_timeout: 300

ingress:
  rtmp_base_url: "rtmp://localhost:1935"  # RTMP endpoint
```

Restart LiveKit server with config:
```bash
livekit-server --config livekit-server-config.yaml
```

#### 3. Use FFmpegAudioStreamer

The `FFmpegAudioStreamer` class (in `services/orchestrator/src/ffmpeg-streamer.js`) handles:
- Creating RTMP Ingress endpoints
- Streaming TTS audio via FFmpeg
- Automatic cleanup

**Usage in orchestrator**:
```javascript
const { FFmpegAudioStreamer } = require('./ffmpeg-streamer');

const streamer = new FFmpegAudioStreamer(
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  TTS_SERVICE_URL
);

// Start streaming
await streamer.startStreaming(session_id, room_name, responseText);
```

---

### 🐍 Option 3: LiveKit Agents SDK (Python)
**Status**: ⏳ **Requires Python environment**

**Best for**: Production deployments with complex agent logic

**Setup**:
```bash
pip install livekit livekit-agents

# Create Python agent
python agent.py
```

**Pros**:
- Official LiveKit solution
- Best performance
- Full feature support

**Cons**:
- Requires Python environment
- More complex deployment
- Mixed-language stack

---

### 🔧 Option 4: Custom WebRTC Implementation
**Status**: ❌ **Not recommended (too complex)**

**Involves**:
- Implementing WebRTC signaling
- Managing ICE/STUN/TURN
- Manual track publication
- Complex and error-prone

---

## 📊 Recommendation Matrix

| Approach | Complexity | Setup Time | Production Ready | Current Status |
|----------|-----------|------------|------------------|----------------|
| Browser TTS | ⭐ | 0 min | ✅ Yes | ✅ **Working** |
| FFmpeg → RTMP | ⭐⭐⭐ | 30 min | ✅ Yes | ⏳ Code ready, needs FFmpeg |
| Python Agents | ⭐⭐⭐⭐ | 1 hour | ✅✅ Best | ❌ Not started |
| Custom WebRTC | ⭐⭐⭐⭐⭐ | Days | ⚠️ Risky | ❌ Not recommended |

---

## 🎯 Recommended Path Forward

### For Immediate Demo:
**Keep using Browser TTS** (current implementation)
- Already working
- Good enough for demo/prototype
- Zero additional setup

### For Production Deployment:
**Implement FFmpeg → RTMP Ingress**
1. Install FFmpeg on server
2. Enable LiveKit Ingress
3. Use provided `FFmpegAudioStreamer` class
4. Connect TTS → FFmpeg → LiveKit

### For Enterprise Scale:
**Migrate to Python Agents SDK**
- Best long-term solution
- Official LiveKit support
- Scales horizontally

---

## 🔨 Quick Start: FFmpeg Setup

**1. Check if FFmpeg installed**:
```bash
ffmpeg -version
```

**2. Install FFmpeg (if missing)**:
```bash
# Windows (Chocolatey)
choco install ffmpeg

# Windows (winget)
winget install ffmpeg

# Or download from: https://ffmpeg.org/download.html
```

**3. Verify FFmpeg working**:
```bash
ffmpeg -f lavfi -i sine=frequency=1000:duration=5 -c:a libopus test.opus
```

**4. Enable Ingress in orchestrator**:

Update `services/orchestrator/src/index.js`:
```javascript
const { FFmpegAudioStreamer } = require('./ffmpeg-streamer');

// Initialize streamer
const audioStreamer = new FFmpegAudioStreamer(
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  TTS_SERVICE_URL
);

// In /converse endpoint, replace browser TTS with:
await audioStreamer.startStreaming(session_id, session.room_name, llmText);
```

**5. Test the setup**:
- Start all services
- Connect frontend to LiveKit
- Ask question via STT
- Audio should stream from server instead of browser TTS

---

## ⚠️ Current Limitations

### Without Ingress Setup:
- Opus packets are encoded but not injected into LiveKit
- Audio plays via browser TTS only
- Server TTS preparation works but isn't transmitted

### With FFmpeg + Ingress:
- ✅ Server-side audio publishing
- ✅ High-quality TTS (ElevenLabs compatible)
- ✅ Synchronized with images via playout_ts
- ✅ Production-ready architecture

---

## 📝 Testing Ingress

Once FFmpeg is installed and Ingress is enabled:

```bash
# Test FFmpeg streaming to RTMP
ffmpeg -re -f lavfi -i sine=frequency=1000:duration=10 \\
  -c:a libopus -f flv rtmp://localhost:1935/live/test

# Check if stream reaches LiveKit room
# Monitor logs in orchestrator and LiveKit server
```

---

## 🚀 Next Steps

Choose one:

**A. Continue with Browser TTS** (0 setup, works now)
- ✅ Already functional
- Good for demo/prototype

**B. Set up FFmpeg Ingress** (30 min setup)
- Install FFmpeg
- Enable LiveKit Ingress
- Uncomment FFmpegAudioStreamer usage

**C. Plan Python Agents migration** (for production)
- Best long-term solution
- Requires architecture planning

---

## 📚 Resources

- [LiveKit Ingress Docs](https://docs.livekit.io/realtime/server/ingress/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [LiveKit Agents SDK](https://github.com/livekit/agents)
- [RTMP Specification](https://en.wikipedia.org/wiki/Real-Time_Messaging_Protocol)

---

**Current Status**: Browser TTS working ✅ | FFmpeg solution ready but needs installation ⏳
