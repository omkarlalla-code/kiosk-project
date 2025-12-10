/**
 * Image Screener Service
 *
 * Responsibilities:
 * - Warm CDN edge caches (HEAD/GET requests)
 * - Resize images using libvips/sharp
 * - LRU caching for frequently accessed images
 * - Return img_ready acknowledgments
 */

const express = require('express');
const { LRUCache } = require('lru-cache');

const app = express();
const PORT = process.env.PORT || 3001;

// LRU cache for image metadata
const imageCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 30, // 30 minutes
});

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'image-screener' });
});

// TODO: Implement endpoints
// POST /preload - Preload image and warm CDN
// GET /ready/:id - Check if image is ready

app.listen(PORT, () => {
  console.log(`Image Screener service listening on port ${PORT}`);
});
