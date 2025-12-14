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
const axios = require('axios');
const sharp = require('sharp');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const ENABLE_RESIZE = process.env.ENABLE_RESIZE === 'true';
const TARGET_WIDTH = parseInt(process.env.TARGET_WIDTH || '1920');
const TARGET_HEIGHT = parseInt(process.env.TARGET_HEIGHT || '1080');

// LRU cache for image metadata
const imageCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 30, // 30 minutes
});

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'image-screener',
    cached_images: imageCache.size,
    resize_enabled: ENABLE_RESIZE
  });
});

/**
 * POST /preload - Preload image and warm CDN
 * Body: { id, cdn_url, resize }
 */
app.post('/preload', async (req, res) => {
  try {
    const { id, cdn_url, resize = false } = req.body;

    if (!id || !cdn_url) {
      return res.status(400).json({ error: 'id and cdn_url are required' });
    }

    // Check if already cached
    const cached = imageCache.get(id);
    if (cached && cached.status === 'ready') {
      console.log(`Image ${id} already cached`);
      return res.json({
        id,
        status: 'ready',
        cdn_url: cached.cdn_url,
        cached: true
      });
    }

    // Mark as warming
    imageCache.set(id, {
      id,
      cdn_url,
      status: 'warming',
      started_at: Date.now()
    });

    console.log(`Warming CDN for ${id}: ${cdn_url}`);

    // Warm CDN with HEAD request first
    await axios.head(cdn_url, { timeout: 5000 });

    // If resize requested and enabled, fetch and resize
    if (resize && ENABLE_RESIZE) {
      console.log(`Resizing ${id} to ${TARGET_WIDTH}x${TARGET_HEIGHT}`);

      const response = await axios.get(cdn_url, {
        responseType: 'arraybuffer',
        timeout: 10000
      });

      const resized = await sharp(response.data)
        .resize(TARGET_WIDTH, TARGET_HEIGHT, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 85 })
        .toBuffer();

      // Store resized image metadata
      imageCache.set(id, {
        id,
        cdn_url,
        status: 'ready',
        warmed_at: Date.now(),
        resized: true,
        size: resized.length
      });
    } else {
      // Just warm, don't resize
      imageCache.set(id, {
        id,
        cdn_url,
        status: 'ready',
        warmed_at: Date.now(),
        resized: false
      });
    }

    console.log(`Image ${id} ready`);

    res.json({
      id,
      status: 'ready',
      cdn_url,
      cached: false
    });
  } catch (error) {
    console.error(`Error preloading ${req.body.id}:`, error.message);

    // Mark as failed
    if (req.body.id) {
      imageCache.set(req.body.id, {
        id: req.body.id,
        cdn_url: req.body.cdn_url,
        status: 'failed',
        error: error.message,
        failed_at: Date.now()
      });
    }

    res.status(500).json({
      error: 'Failed to preload image',
      message: error.message
    });
  }
});

/**
 * POST /batch_preload - Batch preload multiple images
 * Body: { images: [{ id, cdn_url, resize }] }
 */
app.post('/batch_preload', async (req, res) => {
  try {
    const { images } = req.body;

    if (!Array.isArray(images)) {
      return res.status(400).json({ error: 'images array is required' });
    }

    console.log(`Batch preloading ${images.length} images`);

    // Process all images in parallel
    const results = await Promise.allSettled(
      images.map(async (img) => {
        const { id, cdn_url, resize = false } = img;

        // Check cache first
        const cached = imageCache.get(id);
        if (cached && cached.status === 'ready') {
          return { id, status: 'ready', cached: true };
        }

        // Mark as warming
        imageCache.set(id, {
          id,
          cdn_url,
          status: 'warming',
          started_at: Date.now()
        });

        // Warm CDN
        await axios.head(cdn_url, { timeout: 5000 });

        // Optionally resize
        if (resize && ENABLE_RESIZE) {
          const response = await axios.get(cdn_url, {
            responseType: 'arraybuffer',
            timeout: 10000
          });

          await sharp(response.data)
            .resize(TARGET_WIDTH, TARGET_HEIGHT, {
              fit: 'cover',
              position: 'center'
            })
            .webp({ quality: 85 })
            .toBuffer();
        }

        // Mark as ready
        imageCache.set(id, {
          id,
          cdn_url,
          status: 'ready',
          warmed_at: Date.now(),
          resized: resize && ENABLE_RESIZE
        });

        return { id, status: 'ready', cached: false };
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected').map(r => ({
      error: r.reason.message
    }));

    console.log(`Batch complete: ${successful.length} successful, ${failed.length} failed`);

    res.json({
      total: images.length,
      successful: successful.length,
      failed: failed.length,
      results: successful
    });
  } catch (error) {
    console.error('Error in batch preload:', error);
    res.status(500).json({ error: 'Failed to batch preload images' });
  }
});

/**
 * GET /ready/:id - Check if image is ready
 */
app.get('/ready/:id', (req, res) => {
  const { id } = req.params;
  const cached = imageCache.get(id);

  if (!cached) {
    return res.json({
      id,
      status: 'not_found',
      ready: false
    });
  }

  res.json({
    id,
    status: cached.status,
    ready: cached.status === 'ready',
    cdn_url: cached.cdn_url,
    resized: cached.resized,
    warmed_at: cached.warmed_at
  });
});

/**
 * GET /cache/stats - Get cache statistics
 */
app.get('/cache/stats', (req, res) => {
  const allEntries = Array.from(imageCache.entries());

  const stats = {
    total: imageCache.size,
    ready: allEntries.filter(([_, v]) => v.status === 'ready').length,
    warming: allEntries.filter(([_, v]) => v.status === 'warming').length,
    failed: allEntries.filter(([_, v]) => v.status === 'failed').length,
    max_size: imageCache.max,
    ttl_ms: imageCache.ttl
  };

  res.json(stats);
});

/**
 * DELETE /cache/:id - Remove from cache
 */
app.delete('/cache/:id', (req, res) => {
  const { id } = req.params;
  const existed = imageCache.has(id);

  imageCache.delete(id);

  res.json({
    id,
    deleted: existed
  });
});

/**
 * DELETE /cache - Clear entire cache
 */
app.delete('/cache', (req, res) => {
  const count = imageCache.size;
  imageCache.clear();

  console.log(`Cache cleared: ${count} entries removed`);

  res.json({
    cleared: true,
    count
  });
});

app.listen(PORT, () => {
  console.log(`Image Screener service listening on port ${PORT}`);
  console.log(`Resize: ${ENABLE_RESIZE ? 'enabled' : 'disabled'}`);
  if (ENABLE_RESIZE) {
    console.log(`Target dimensions: ${TARGET_WIDTH}x${TARGET_HEIGHT}`);
  }
});
