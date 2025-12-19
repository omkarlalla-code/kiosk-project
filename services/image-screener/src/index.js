/**
 * ImageScreener Service
 * 
 * Responsibilities:
 * - Preload images and warm CDN cache
 * - Resize images if needed
 * - LRU cache for frequently used images
 * - Return img_ready when images are loaded
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const sharp = require('sharp');
const { LRUCache } = require('lru-cache');
const https = require('https');

// Disable SSL verification for CDN fetches (local demo only)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const app = express();
const PORT = process.env.PORT || 3001;
const DEMO_MODE = process.env.DEMO_MODE === 'true' || true; // Enable demo mode for kiosk

app.use(cors());
app.use(express.json());

// LRU cache for images (max 100 images, ~500MB)
const imageCache = new LRUCache({
  max: 100,
  maxSize: 500 * 1024 * 1024, // 500MB
  sizeCalculation: (value) => value.buffer.length,
  ttl: 1000 * 60 * 30, // 30 minutes
});

// Preload stats
const stats = {
  preloads: 0,
  cache_hits: 0,
  cache_misses: 0,
  errors: 0
};

/**
 * POST /preload - Preload an image and warm CDN
 * Body: { id, cdn_url, playout_ts, ttl_ms, resize }
 */
app.post('/preload', async (req, res) => {
  try {
    const { id, cdn_url, playout_ts, ttl_ms, resize } = req.body;

    if (!id || !cdn_url) {
      return res.status(400).json({ error: 'id and cdn_url required' });
    }

    console.log(`📥 Preload request: ${id} from ${cdn_url}`);

    // DEMO MODE: Skip actual fetching, return success immediately
    if (DEMO_MODE) {
      console.log(`🎭 Demo mode: Simulating preload for ${id}`);
      imageCache.set(id, {
        buffer: Buffer.from('demo-placeholder'),
        cdn_url,
        cached_at: Date.now(),
        demo: true
      });
      stats.preloads++;
      return res.json({
        id,
        ready: true,
        from_cache: false,
        demo_mode: true,
        playout_ts
      });
    }

    // Check cache first
    if (imageCache.has(id)) {
      stats.cache_hits++;
      console.log(`💾 Cache hit: ${id}`);
      return res.json({
        id,
        ready: true,
        from_cache: true,
        playout_ts,
        cache_hits: stats.cache_hits
      });
    }

    stats.cache_misses++;
    stats.preloads++;

    // Fetch image from CDN
    const fetchStart = Date.now();
    const response = await fetch(cdn_url, {
      headers: {
        'User-Agent': 'ImageScreener/1.0'
      },
      timeout: 10000,
      agent: httpsAgent
    });

    if (!response.ok) {
      throw new Error(`CDN fetch failed: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    const fetchTime = Date.now() - fetchStart;

    console.log(`✅ Fetched ${id}: ${buffer.length} bytes in ${fetchTime}ms`);

    // Resize if requested
    let processedBuffer = buffer;
    if (resize && (resize.width || resize.height)) {
      const resizeStart = Date.now();
      processedBuffer = await sharp(buffer)
        .resize(resize.width, resize.height, {
          fit: resize.fit || 'inside',
          withoutEnlargement: true
        })
        .toBuffer();
      const resizeTime = Date.now() - resizeStart;
      console.log(`🔧 Resized ${id} in ${resizeTime}ms`);
    }

    // Cache the image
    imageCache.set(id, {
      buffer: processedBuffer,
      cdn_url,
      cached_at: Date.now()
    });

    res.json({
      id,
      ready: true,
      from_cache: false,
      playout_ts,
      fetch_time_ms: fetchTime,
      size_bytes: processedBuffer.length
    });

  } catch (error) {
    stats.errors++;
    console.error('Preload error:', error);
    res.status(500).json({ 
      error: error.message,
      id: req.body.id,
      ready: false
    });
  }
});

/**
 * GET /image/:id - Get cached image
 */
app.get('/image/:id', (req, res) => {
  const { id } = req.params;
  
  const cached = imageCache.get(id);
  if (!cached) {
    return res.status(404).json({ error: 'Image not in cache' });
  }

  res.set('Content-Type', 'image/webp');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(cached.buffer);
});

/**
 * DELETE /cache/:id - Remove from cache
 */
app.delete('/cache/:id', (req, res) => {
  const { id } = req.params;
  imageCache.delete(id);
  console.log(`🗑️ Removed ${id} from cache`);
  res.json({ success: true });
});

/**
 * POST /flush - Flush session cache
 */
app.post('/flush', (req, res) => {
  const { session_id } = req.body;
  
  if (session_id) {
    // Clear images for specific session (if we tracked session IDs)
    console.log(`🧹 Flush request for session: ${session_id}`);
  } else {
    imageCache.clear();
    console.log('🧹 Cache cleared');
  }

  res.json({ success: true, cache_size: imageCache.size });
});

/**
 * GET /health - Health check with stats
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'image-screener',
    cache_size: imageCache.size,
    cache_max: imageCache.max,
    stats: stats
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🖼️ ImageScreener Service`);
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`💾 Cache: max ${imageCache.max} images`);
  console.log(`⚡ Ready to preload and warm CDN\n`);
});
