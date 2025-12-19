/**
 * Image Scheduler
 * Handles image preloading, scheduling based on playout_ts, and crossfade transitions
 */

export class ImageScheduler {
  constructor(options) {
    this.containerA = options.containerA;
    this.containerB = options.containerB;
    this.captionEl = options.captionEl;
    this.creditEl = options.creditEl;

    this.audioContext = null;
    this.audioElement = null;
    this.timeOffset = null; // Offset between server playout_ts and client performance.now()
    this.preloadedImages = new Map();
    this.scheduledShows = [];
    this.currentBuffer = 'a';
    this.currentImageId = null;
    this.syncInitialized = false;

    this.fallbackImages = new Map();
    this.loadFallbackImages();
  }

  setAudioContext(audioContext, audioElement) {
    this.audioContext = audioContext;
    this.audioElement = audioElement;
    console.log('Audio context and element set');
  }

  /**
   * Initialize time synchronization when first control message arrives
   * @param {number} serverPlayoutTs - Server's playout_ts from first control message
   */
  initializeSync(serverPlayoutTs) {
    if (this.syncInitialized) return;

    const clientNow = performance.now();
    this.timeOffset = serverPlayoutTs - clientNow;
    this.syncInitialized = true;

    console.log(`Time sync initialized: offset=${this.timeOffset}ms`);
    console.log(`  Server playout_ts: ${serverPlayoutTs}`);
    console.log(`  Client now: ${clientNow}`);
  }

  /**
   * Convert server playout_ts to client performance.now() time
   * @param {number} serverPlayoutTs - Timestamp from server in audio timeline
   * @returns {number} Equivalent time in client's performance.now() timeline
   */
  convertToLocalTime(serverPlayoutTs) {
    if (!this.syncInitialized) {
      console.warn('Time sync not initialized, initializing with current playout_ts');
      this.initializeSync(serverPlayoutTs);
      return performance.now();
    }
    return serverPlayoutTs - this.timeOffset;
  }

  async loadFallbackImages() {
    // TODO: Load local fallback image pack
    console.log('Loading fallback images...');
  }

  async preload(message) {
    const { id, cdn_url, ttl_ms, playout_ts } = message;

    // Initialize sync on first message with playout_ts
    if (!this.syncInitialized && playout_ts) {
      this.initializeSync(playout_ts);
    }

    console.log(`Preloading image: ${id}`);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = cdn_url;
      });

      this.preloadedImages.set(id, {
        img,
        url: cdn_url,
        loadedAt: performance.now(),
      });

      // Set TTL cleanup
      if (ttl_ms) {
        setTimeout(() => {
          this.preloadedImages.delete(id);
          console.log(`Cleaned up image: ${id}`);
        }, ttl_ms);
      }

      console.log(`Image preloaded: ${id}`);
    } catch (error) {
      console.error(`Failed to preload image ${id}:`, error);
      // Use fallback if available
    }
  }

  scheduleShow(message) {
    const { id, playout_ts, transition = 'crossfade', duration_ms = 400, caption, credit } = message;

    // Initialize sync on first message with playout_ts
    if (!this.syncInitialized && playout_ts) {
      this.initializeSync(playout_ts);
    }

    // Convert server playout_ts to local client time
    const localPlayoutTime = this.convertToLocalTime(playout_ts);
    const now = performance.now();
    const delay = localPlayoutTime - now;

    console.log(`Scheduling image show: ${id}`);
    console.log(`  Server playout_ts: ${playout_ts}`);
    console.log(`  Local playout time: ${localPlayoutTime}`);
    console.log(`  Current time: ${now}`);
    console.log(`  Delay: ${delay}ms`);

    if (delay > 0) {
      // Schedule for future
      const timeoutId = setTimeout(() => {
        this.showImage(id, transition, duration_ms, caption, credit);
      }, delay);

      this.scheduledShows.push({ id, timeoutId });
    } else if (delay > -100) {
      // Show immediately if we're slightly late (within 100ms tolerance)
      console.warn(`Late by ${-delay}ms, showing immediately`);
      this.showImage(id, transition, duration_ms, caption, credit);
    } else {
      // Too late, skip this image
      console.error(`Too late to show image ${id} (${-delay}ms behind), skipping`);
    }
  }

  showImage(id, transition, duration_ms, caption, credit) {
    const imageData = this.preloadedImages.get(id);

    if (!imageData) {
      console.warn(`Image not preloaded: ${id}`);
      // Try fallback
      return;
    }

    // Determine which buffer to use
    const nextBuffer = this.currentBuffer === 'a' ? 'b' : 'a';
    const nextContainer = nextBuffer === 'a' ? this.containerA : this.containerB;
    const currentContainer = this.currentBuffer === 'a' ? this.containerA : this.containerB;

    // Clear next buffer and set new image
    nextContainer.innerHTML = '';
    nextContainer.style.backgroundImage = `url(${imageData.url})`;
    nextContainer.style.backgroundSize = 'cover';
    nextContainer.style.backgroundPosition = 'center';

    // Perform transition
    if (transition === 'crossfade') {
      this.crossfade(currentContainer, nextContainer, duration_ms);
    } else {
      // Instant swap
      currentContainer.style.opacity = '0';
      nextContainer.style.opacity = '1';
    }

    // Update current buffer
    this.currentBuffer = nextBuffer;
    this.currentImageId = id;

    // Update caption and credit
    if (this.captionEl && caption) {
      this.captionEl.textContent = caption;
    }
    if (this.creditEl && credit) {
      this.creditEl.textContent = credit;
    }
  }

  crossfade(fromEl, toEl, duration_ms) {
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration_ms, 1);

      fromEl.style.opacity = String(1 - progress);
      toEl.style.opacity = String(progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Clear all scheduled image shows
   */
  clearScheduled() {
    for (const scheduled of this.scheduledShows) {
      clearTimeout(scheduled.timeoutId);
    }
    this.scheduledShows = [];
    console.log('Cleared all scheduled image shows');
  }

  /**
   * Reset time synchronization (useful when restarting a session)
   */
  resetSync() {
    this.timeOffset = null;
    this.syncInitialized = false;
    this.clearScheduled();
    console.log('Time synchronization reset');
  }

  /**
   * Get sync stats for debugging
   */
  getSyncStats() {
    return {
      syncInitialized: this.syncInitialized,
      timeOffset: this.timeOffset,
      scheduledCount: this.scheduledShows.length,
      preloadedCount: this.preloadedImages.size,
    };
  }

  next() {
    // TODO: Implement manual next
    console.log('Next image');
  }

  prev() {
    // TODO: Implement manual prev
    console.log('Previous image');
  }
}
