# Image Screener Service

CDN warming and image preprocessing service.

## Responsibilities

- Warm CDN edge caches via HEAD/GET requests
- Resize images to optimal display sizes using Sharp
- Maintain LRU cache of frequently accessed images
- Provide img_ready acknowledgments to orchestrator

## API Endpoints

- `POST /preload` - Preload image and warm CDN edge
- `GET /ready/:id` - Check if image is cached and ready
- `GET /health` - Health check

## Environment Variables

```
CDN_BASE_URL=
MAX_CACHE_SIZE=500
IMAGE_TTL_MS=1800000
```

## Development

```bash
npm install
npm run dev
```
