# Mock TTS Service

Deterministic TTS mock for end-to-end testing of audio+image synchronization.

## Responsibilities

- Stream pre-recorded Opus audio frames with metadata
- Emit synchronized control messages (img_preload, img_show) with playout_ts
- Provide deterministic test scripts
- Simulate network jitter and packet loss for resilience testing

## WebSocket Protocol

Connect to `ws://localhost:3002/stream`

### Outgoing Messages

**Audio Frame:**
```json
{
  "type": "audio_frame",
  "frame_id": 123,
  "format": "opus",
  "data_base64": "...",
  "playout_ts": 1690000000400
}
```

**Image Preload:**
```json
{
  "type": "img_preload",
  "id": "parthenon_overview",
  "cdn_url": "https://cdn/.../parthenon.webp",
  "playout_ts": 1690000000000,
  "ttl_ms": 8000
}
```

**Image Show:**
```json
{
  "type": "img_show",
  "id": "parthenon_overview",
  "playout_ts": 1690000000500,
  "transition": "crossfade",
  "duration_ms": 400
}
```

## Test Modes

- `normal` - Standard streaming at 20ms chunks
- `jitter` - Simulate network jitter (±50ms variance)
- `loss` - Simulate 5% packet loss

## Development

```bash
npm install
npm run dev
```
