# Greek Civilization Kiosk - Electron App

Full-screen interactive kiosk application for museum exhibits. Features AI-powered conversations about Greek civilization with synchronized images.

## Features

- **3-Layer State System**:
  1. **Idle**: Screensaver slideshow with Greek images
  2. **Payment**: Token-based time selection (30s, 1min, 2min, 5min)
  3. **Active**: Interactive chat with AI, STT, TTS, and synchronized images

- **Clean UI Design**:
  - Complete black background (#000000)
  - Zero gradients
  - No buttons or camera view in active mode
  - 70/30 split (images top, interaction bottom)

- **Technical Features**:
  - LiveKit WebRTC integration
  - Browser Speech Recognition (STT)
  - ElevenLabs TTS with audio queueing
  - Two-buffer image crossfade system
  - Session timer with auto-end
  - LLM-controlled chat termination

## Installation

### Prerequisites

- Node.js 18+
- All backend services running:
  - Orchestrator (port 3000)
  - TTS Service (port 3002)
  - LLM Service (port 3003)
  - Image Screener (port 3001)
  - LiveKit Server (port 7880)
  - HTTP Server (port 8080)

### Install Dependencies

```bash
cd kiosk-electron
npm install
```

## Running the App

### Development Mode

```bash
npm run dev
```

This opens the Electron app in development mode with dev tools enabled.

### Production Mode

```bash
npm start
```

## Building for Linux

Build a distributable package for Linux Debian 13.2:

```bash
npm run build:linux
```

This creates:
- `dist/greek-kiosk_1.0.0_amd64.deb` - Debian package
- `dist/greek-kiosk-1.0.0.AppImage` - Universal Linux binary

### Installing the DEB Package

```bash
sudo dpkg -i dist/greek-kiosk_1.0.0_amd64.deb
```

### Running the AppImage

```bash
chmod +x dist/greek-kiosk-1.0.0.AppImage
./dist/greek-kiosk-1.0.0.AppImage
```

## Configuration

Set the orchestrator URL via environment variable:

```bash
export ORCHESTRATOR_URL=http://localhost:3000
npm start
```

## Kiosk Controls (Admin Only)

While the app runs in fullscreen kiosk mode, these keyboard shortcuts are available for administrators:

- **Ctrl+Shift+Q**: Emergency quit
- **Ctrl+Shift+R**: Reload app
- **Ctrl+Shift+I**: Toggle developer tools

## State Flow

```
Idle (Screensaver)
  ↓ [Touch/Click]
Payment (Select Duration)
  ↓ [Select 30s/1min/2min/5min]
Active (Chat Session)
  ↓ [Timer expires OR LLM end signal]
Back to Idle
```

## Active State Layout

```
┌─────────────────────────────────┐
│  [Timer: 1:23]                  │
│                                 │
│                                 │
│      Main Image Display         │ 70%
│      (Two-buffer crossfade)     │
│                                 │
│                                 │
├─────────────────────────────────┤
│  Listening...                   │
│  [User's speech transcribed]    │ 30%
│                                 │
│  Suggested prompts...           │
└─────────────────────────────────┘
```

## Features in Detail

### Audio Queueing System

User can speak while AI is responding. New responses are queued and played sequentially without interruption.

### Session Timer

- Counts down from selected duration
- Shows in top-right corner
- Turns red with 10 seconds remaining
- Auto-returns to idle when expired

### LLM End-Chat Signal

AI can end the session by including `"end_chat": true` in its response. Triggers when user says goodbye or asks to end.

### Image Synchronization

- Images scheduled with precise timestamps
- Two-buffer crossfade for smooth transitions
- Caption overlay on images
- Preloading for smooth playback

## Performance Optimizations

- Minimum latency audio pipeline
- Two-buffer image system prevents flickering
- Audio queueing prevents interruptions
- Efficient STT with continuous recognition
- No camera view = reduced resource usage

## Troubleshooting

### App Won't Start

1. Check all backend services are running
2. Verify ports 3000, 3001, 3002, 3003, 7880, 8080 are accessible
3. Check firewall settings

### No Audio Playback

1. Verify TTS service is running on port 3002
2. Check ElevenLabs API key in services/real-tts/.env
3. Check browser console for audio decode errors

### Images Not Loading

1. Verify image screener is running on port 3001
2. Check public/images/greek/ directory exists
3. Verify HTTP server is serving from public/ directory

### STT Not Working

- Microphone permissions must be granted
- Works in Chromium/Electron (Web Speech API)
- Check system audio input settings

## Linux Debian 13.2 Compatibility

Tested and optimized for:
- Debian 13.2 (Trixie)
- X11 and Wayland
- GNOME, KDE, XFCE

### Permissions Required

```bash
# Allow microphone access
sudo usermod -a -G audio $USER

# Allow fullscreen (if needed)
xhost +local:
```

## License

MIT
