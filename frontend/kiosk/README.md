# Kiosk Client

Electron-based kiosk application for Greek civilization interactive experience.

## Features

- WebRTC audio streaming via LiveKit
- Synchronized image display with audio playout
- MediaPipe gesture control
- UPI payment integration
- Fullscreen kiosk mode

## Architecture

### Components

1. **LiveKit Client** - WebRTC connection management
2. **Image Scheduler** - Playout-ts based image synchronization with crossfade transitions
3. **Gesture Controller** - MediaPipe hand tracking for gesture recognition
4. **Payment UI** - QR code display and payment confirmation

### Message Types

The client handles these DataChannel messages:

- `img_preload` - Preload image from CDN
- `img_show` - Schedule image display at playout_ts
- `payment_ready` - Display payment QR code
- `payment_confirm` - Verify and unlock content
- `end_of_stream` - Audio stream ended

## Development

### Install Dependencies

```bash
npm install
```

### Run Development Mode

```bash
npm run dev
```

This starts:
- Vite dev server on `http://localhost:5173`
- Electron app in development mode

### Build for Production

```bash
npm run build
```

## Environment Variables

Create a `.env` file:

```
VITE_ORCHESTRATOR_URL=http://localhost:3000
VITE_LIVEKIT_URL=wss://your-livekit-url
```

## Electron Configuration

### Kiosk Mode

The app runs in fullscreen kiosk mode by default. To disable:

Edit `electron/main.js`:
```javascript
fullscreen: false,
kiosk: false,
```

### Performance Flags

For low-spec hardware, add flags in `electron/main.js`:

```javascript
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1536');
```

## Target Hardware

- CPU: i5 13th gen (or equivalent)
- RAM: 16GB
- OS: Fedora Linux (or Windows/macOS)
- Display: 1920x1080 fullscreen

## MediaPipe Setup

Gesture recognition runs at:
- Resolution: 480x270
- FPS: 5-10
- Model: Lightweight (complexity 0)
- Runs in CPU mode for compatibility

## Image Caching

- LRU cache: 20-50 images
- Format: WebP preferred
- CDN: Pre-warmed by ImageScreener service
- Fallback: Local image pack for offline mode

## Troubleshooting

### Audio not playing
- Check LiveKit connection status
- Verify token is valid
- Check browser audio permissions

### Images not loading
- Verify CDN URL is accessible
- Check CORS configuration
- Inspect network tab for failed requests

### Gestures not working
- Ensure webcam is connected and permitted
- Check MediaPipe model loading
- View gesture debug canvas if enabled
