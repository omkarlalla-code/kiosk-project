# Greek Civilization Kiosk - Test Page

## Overview

This is a fully functional kiosk client that demonstrates the complete pipeline:

✅ Session management
✅ LiveKit WebRTC connection
✅ Image preloading and display
✅ Synchronized narration (text-based until audio publishing is implemented)
✅ Control message handling
✅ Real-time stats and logging

## Prerequisites

Make sure the following services are running:

```bash
# 1. Real TTS Service (port 3002)
cd services/real-tts
node src/index.js

# 2. Orchestrator Service (port 3000)
cd services/orchestrator
node src/index.js
```

## How to Use

### 1. Open the Test Page

Open `test-kiosk-client.html` in your web browser:

```bash
# Option 1: Double-click the file in File Explorer

# Option 2: Start a simple HTTP server (recommended)
python -m http.server 8080
# Then open: http://localhost:8080/test-kiosk-client.html

# Option 3: Use VS Code Live Server extension
```

### 2. Start the Experience

1. Click **"Start Experience"** button
2. Watch the session creation process in the status bar
3. The pipeline will:
   - ✅ Create a session with the orchestrator
   - ✅ Connect to LiveKit room using the token
   - ✅ Start the Greek civilization narration
   - ✅ Receive control messages via DataChannel
   - ✅ Preload images before they're shown
   - ✅ Display images with captions synchronized to the narration

### 3. Monitor Activity

**Stats Overlay (Top Left)**:
- Session ID
- Room name
- Messages received count
- Images shown (current/total)

**Event Log (Toggle with "Toggle Logs" button)**:
- Real-time event stream
- Control message types
- Image preload/show events
- Errors and warnings

**Progress Bar**:
- Shows experience progress
- Fills as narration completes

### 4. Stop the Experience

Click **"Stop"** to end the session and cleanup LiveKit resources.

## What You'll See

### The Greek Civilization Experience

**Part 1: The Parthenon**
- Image appears after ~10 words of narration
- Shows the iconic Parthenon temple
- Caption: "The Parthenon — Athens, 447 BC"

**Part 2: The Acropolis**
- Image appears after ~30 words
- Shows the Acropolis of Athens
- Caption: "The Acropolis of Athens"

**Control Flow**:
1. `img_preload` message → Image downloads in background (5 words before show)
2. `img_show` message → Image fades in with caption
3. `end_of_stream` message → Experience complete

## Current Functionality

### ✅ Implemented and Working

- **Session Management**: Creates sessions with 10-minute timeout
- **LiveKit Connection**: Connects to LiveKit room as participant
- **DataChannel Messages**: Receives control messages from orchestrator
- **Image Preloading**: Downloads images before displaying
- **Image Display**: Smooth crossfade transitions with captions
- **TTS Caching**: Second run uses cached audio (check orchestrator logs)
- **Session Cleanup**: Automatic timeout and manual stop

### ⚠️ Simulated (Not Yet Implemented)

- **Audio Playback**: Control messages work, but audio track publishing requires:
  - LiveKit Ingress API setup, OR
  - LiveKit Agents SDK (Python), OR
  - Server-side WebRTC with wrtc module

## Testing the Pipeline

### Test 1: First Run (Generate & Cache)

```bash
# Watch orchestrator logs
# Expected: "🔊 Generating new TTS audio"
# Expected: "✅ Cached audio for text hash: ..."
```

### Test 2: Second Run (Serve from Cache)

```bash
# Refresh page and start again
# Watch orchestrator logs
# Expected: "✅ Serving cached audio (2096.3KB)"
# Result: Instant response, no TTS generation
```

### Test 3: Session Timeout

```bash
# Start experience but don't stop it manually
# Wait 10 minutes
# Check orchestrator logs
# Expected: "⏰ Session {id} timed out after 600000ms"
# Expected: "✅ Deleted LiveKit room: ..."
```

### Test 4: Multiple Sessions

```bash
# Open test page in 2 browser tabs
# Start both experiences
# Check orchestrator health: curl http://localhost:3000/health
# Expected: {"active_sessions": 2, "total_sessions": 2}
```

## Troubleshooting

### "Failed to connect to LiveKit"

**Cause**: LiveKit credentials incorrect or network issue

**Fix**:
```bash
# Check .env file in services/orchestrator/
# Verify LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
```

### No images appearing

**Cause**: Control messages not being received

**Check**:
1. Toggle logs panel - look for `📨 Received: img_show` messages
2. Check browser console for errors
3. Verify real-tts service is running

### "Session not found"

**Cause**: Orchestrator service restarted (in-memory sessions lost)

**Fix**: Refresh page and start a new session

## Architecture Flow

```
┌─────────────┐
│  Test Page  │ (Browser)
└──────┬──────┘
       │ 1. POST /start_session
       ↓
┌─────────────────┐
│  Orchestrator   │ (Port 3000)
└──────┬──────────┘
       │ 2. Returns: session_id, token, room_name
       │
       │ 3. Client connects to LiveKit
       ↓
┌─────────────────┐
│  LiveKit Cloud  │ (WebRTC SFU)
└──────┬──────────┘
       │ 4. POST /start_narration
       ↓
┌─────────────────┐
│  Orchestrator   │
└──────┬──────────┘
       │ 5. WebSocket to TTS
       ↓
┌─────────────────┐
│   Real TTS      │ (Port 3002)
└──────┬──────────┘
       │ 6. Stream PCM + control messages
       ↓
┌─────────────────┐
│  Orchestrator   │
└──────┬──────────┘
       │ 7. Encode to Opus (ready for injection)
       │ 8. Send control messages via LiveKit DataChannel
       ↓
┌─────────────────┐
│  LiveKit Cloud  │
└──────┬──────────┘
       │ 9. Receive data messages
       ↓
┌─────────────────┐
│   Test Page     │
└─────────────────┘
       │ 10. Display images with captions
```

## Next Steps

### To Add Audio Playback

**Option 1: LiveKit Ingress (Recommended)**
```bash
# Create WHIP ingress endpoint
curl -X POST https://api.livekit.io/v1/ingress \
  -H "Authorization: Bearer $LIVEKIT_API_KEY" \
  -d '{"input_type": "WHIP_INPUT", "room_name": "your-room"}'

# Publish Opus packets to WHIP endpoint
```

**Option 2: LiveKit Agents SDK (Python)**
```python
from livekit import agents, rtc

# Create server-side participant that publishes audio
```

**Option 3: wrtc Module (Node.js)**
```bash
# Requires native compilation (C++ toolchain)
npm install wrtc
```

## Cost Optimization Verification

With this test page, you can verify all cost optimizations:

✅ **TTS Caching**: Second run serves from cache (check logs)
✅ **Session Timeout**: Leave idle for 10 min, verify auto-cleanup
✅ **Image Optimization**: Images served as WebP (check Network tab)
✅ **DataChannel**: Control messages received without polling

## Demo Script

For presentations:

1. **Start**: "This is a kiosk showing ancient Greek civilization"
2. **Click Start**: "Creating session with LiveKit..."
3. **First Image**: "The Parthenon appears synchronized with narration"
4. **Second Image**: "Transition to the Acropolis"
5. **Complete**: "Experience ends, session cleanup automatic"
6. **Run Again**: "Second run uses cached audio - instant response"

---

**Enjoy exploring ancient Greece! 🏛️**
