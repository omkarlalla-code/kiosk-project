/**
 * Real TTS Service using OpenAI TTS-1
 *
 * Responsibilities:
 * - Stream real TTS audio using OpenAI TTS-1 API (primary)
 * - Fallback to espeak (Linux) or mock audio
 * - Emit interleaved control messages (img_preload, img_show)
 * - Output PCM audio chunks for Orchestrator to encode to Opus
 * - Provide Greek civilization narration scripts
 */

require('dotenv').config();

const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { Readable, PassThrough } = require('stream');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const OpenAI = require('openai');
const prism = require('prism-media');
const ffmpegPath = require('ffmpeg-static');
const { createClient } = require('@deepgram/sdk');

const app = express();
const PORT = process.env.PORT || 3002;

// TTS Provider Configuration
const TTS_PROVIDER = process.env.TTS_PROVIDER || 'deepgram'; // deepgram, elevenlabs, or openai

// Deepgram Configuration (primary)
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_VOICE = process.env.DEEPGRAM_VOICE || 'aura-2-cordelia-en';
const USE_DEEPGRAM = DEEPGRAM_API_KEY && DEEPGRAM_API_KEY.length > 0;
const deepgram = USE_DEEPGRAM ? createClient(DEEPGRAM_API_KEY) : null;

// ElevenLabs Configuration (fallback)
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const USE_ELEVENLABS = ELEVENLABS_API_KEY && ELEVENLABS_API_KEY.length > 0;

// OpenAI Configuration (fallback)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const USE_OPENAI = OPENAI_API_KEY && OPENAI_API_KEY.length > 0;
const openai = USE_OPENAI ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Debug logging
console.log(`🎤 TTS Provider: ${TTS_PROVIDER}`);
console.log(`🔑 Deepgram API Key: ${DEEPGRAM_API_KEY ? DEEPGRAM_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
console.log(`🔑 ElevenLabs API Key: ${ELEVENLABS_API_KEY ? ELEVENLABS_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);

// TTS Cache Configuration
const CACHE_DIR = path.join(__dirname, '..', 'cache', 'tts');
const ENABLE_CACHE = process.env.ENABLE_TTS_CACHE !== 'false'; // Default: enabled

// Ensure cache directory exists
if (ENABLE_CACHE && !fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`Created TTS cache directory: ${CACHE_DIR}`);
}

// Generate cache key from text content
function getCacheKey(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Get cache file path for text
function getCachePath(text) {
  const key = getCacheKey(text);
  return path.join(CACHE_DIR, `${key}.pcm`);
}

// Check if cached audio exists
function hasCachedAudio(text) {
  if (!ENABLE_CACHE) return false;
  const cachePath = getCachePath(text);
  return fs.existsSync(cachePath);
}

// Save audio to cache
function saveToCacheAsync(text, audioBuffer) {
  if (!ENABLE_CACHE) return;

  const cachePath = getCachePath(text);
  fs.writeFile(cachePath, audioBuffer, (err) => {
    if (err) {
      console.error('Error saving to cache:', err.message);
    } else {
      console.log(`✅ Cached audio for text hash: ${getCacheKey(text).substring(0, 12)}...`);
    }
  });
}

// Load audio from cache
function loadFromCache(text) {
  if (!ENABLE_CACHE) return null;

  const cachePath = getCachePath(text);
  try {
    if (fs.existsSync(cachePath)) {
      const buffer = fs.readFileSync(cachePath);
      console.log(`✅ Serving cached audio (${(buffer.length / 1024).toFixed(1)}KB) for text hash: ${getCacheKey(text).substring(0, 12)}...`);
      return buffer;
    }
  } catch (error) {
    console.error('Error loading from cache:', error.message);
  }
  return null;
}

/**
 * Synthesize text using OpenAI TTS-1 API
 * Returns PCM stream (48kHz, mono, 16-bit)
 */
async function synthesizeWithOpenAI(text) {
  console.log(`🎤 Calling OpenAI TTS-1 API (${text.length} chars)`);

  const mp3Response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
    input: text,
    response_format: 'mp3',
    speed: 1.0
  });

  // Get the MP3 buffer
  const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer());
  console.log(`✅ Received MP3 audio: ${(mp3Buffer.length / 1024).toFixed(1)}KB`);

  // Convert MP3 to PCM using prism-media with ffmpeg-static
  // OpenAI returns 24kHz MP3, we need 48kHz PCM for LiveKit
  const pcmStream = new PassThrough();
  const ffmpegStream = new prism.FFmpeg({
    command: ffmpegPath,
    args: [
      '-analyzeduration', '0',
      '-loglevel', '0',
      '-f', 'mp3',
      '-i', 'pipe:0',
      '-ar', '48000',      // Resample to 48kHz
      '-ac', '1',          // Mono
      '-f', 's16le',       // 16-bit signed little-endian PCM
      'pipe:1'
    ]
  });

  // Create readable stream from MP3 buffer
  const mp3Stream = new Readable({
    read() {
      this.push(mp3Buffer);
      this.push(null);
    }
  });

  // Pipeline: MP3 buffer → FFmpeg → PCM stream
  mp3Stream.pipe(ffmpegStream).pipe(pcmStream);

  return pcmStream;
}

/**
 * Stream TTS audio from ElevenLabs API
 * Returns MP3 stream that needs to be converted to PCM
 */
async function streamFromElevenLabs(text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.statusText}`);
  }

  return response.body;
}

app.use(express.json());

app.get('/health', (req, res) => {
  const engine = USE_DEEPGRAM && TTS_PROVIDER === 'deepgram'
    ? 'deepgram'
    : (USE_ELEVENLABS ? 'elevenlabs' : (USE_OPENAI ? 'openai-tts-1' : 'espeak/mock'));
  res.json({
    status: 'ok',
    service: 'real-tts',
    engine,
    provider: TTS_PROVIDER,
    deepgram_enabled: USE_DEEPGRAM,
    deepgram_voice: DEEPGRAM_VOICE,
    elevenlabs_enabled: USE_ELEVENLABS,
    openai_enabled: USE_OPENAI,
    cache_enabled: ENABLE_CACHE
  });
});

// WebSocket server for streaming
const wss = new WebSocket.Server({ noServer: true });

/**
 * Stream cached audio to WebSocket client
 */
function streamCachedAudio(ws, audioBuffer, images, startTime, totalWords, text, session_id) {
  const CHUNK_SIZE = 1920; // 20ms at 48kHz mono (960 samples × 2 bytes)
  const SAMPLE_RATE = 48000;

  let offset = 0;
  let frameId = 0;
  let currentTimeOffset = 0;
  let wordCount = 0;

  const preloaded = new Set();
  const shown = new Set();

  // Stream chunks with timing
  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }

    if (offset >= audioBuffer.length) {
      clearInterval(interval);

      // Send end_of_stream
      ws.send(JSON.stringify({
        type: 'end_of_stream',
        session_id
      }));
      console.log(`✅ Cached stream completed: ${frameId} frames from cache`);
      return;
    }

    // Get chunk
    const chunkEnd = Math.min(offset + CHUNK_SIZE, audioBuffer.length);
    const chunk = audioBuffer.slice(offset, chunkEnd);
    offset = chunkEnd;

    const playoutTs = startTime + currentTimeOffset;

    // Send audio frame
    ws.send(JSON.stringify({
      type: 'audio_frame',
      frame_id: frameId,
      format: 'pcm',
      sample_rate: SAMPLE_RATE,
      channels: 1,
      bits_per_sample: 16,
      data_base64: chunk.toString('base64'),
      playout_ts: playoutTs
    }));

    // Calculate current word position
    const chunkDurationMs = (chunk.length / 2) / SAMPLE_RATE * 1000;
    const wordsPerMs = totalWords / (text.length * 5);
    wordCount += chunkDurationMs * wordsPerMs;

    // Check for image preload/show
    for (const img of images) {
      const { id, show_at_word } = img;

      // Preload 5 words before show
      if (wordCount >= (show_at_word - 5) && !preloaded.has(id)) {
        ws.send(JSON.stringify({
          type: 'img_preload',
          id,
          cdn_url: img.cdn_url,
          ttl_ms: 10000,
          playout_ts: playoutTs,
          offset: 0
        }));
        preloaded.add(id);
      }

      // Show image
      if (wordCount >= show_at_word && !shown.has(id)) {
        ws.send(JSON.stringify({
          type: 'img_show',
          id,
          transition: 'crossfade',
          duration_ms: 400,
          caption: img.caption,
          credit: img.credit,
          playout_ts: playoutTs,
          offset: 0
        }));
        shown.add(id);
      }
    }

    currentTimeOffset += chunkDurationMs;
    frameId++;
  }, 20); // 20ms intervals
}

// Greek civilization script
const GREEK_SCRIPT = {
  topic: 'greek_civilization',
  text: `Welcome to ancient Greece, the cradle of Western civilization.

Before you stands the Parthenon, the most iconic symbol of ancient Athens.
Built in 447 BC, this magnificent temple was dedicated to the goddess Athena.

The Acropolis of Athens rises majestically above the city.
Here, democracy was born and philosophy flourished.

Greek civilization gave us mathematics, theater, and the Olympic Games.
Their influence echoes through the millennia.`,
  images: [
    {
      id: 'parthenon_1',
      cdn_url: 'https://images.unsplash.com/photo-1555993539-1732b0258235?w=1920&h=1080&fit=crop',
      show_at_word: 10, // "Before you stands"
      caption: 'The Parthenon — Athens, 447 BC',
      credit: 'Photo: Unsplash'
    },
    {
      id: 'acropolis_1',
      cdn_url: 'https://images.unsplash.com/photo-1603565816030-6b389eeb23cb?w=1920&h=1080&fit=crop',
      show_at_word: 30, // "The Acropolis"
      caption: 'The Acropolis of Athens',
      credit: 'Photo: Unsplash'
    }
  ]
};

function streamTTS(ws, config = {}) {
  const { topic = 'greek_civilization', session_id = 'default' } = config;

  console.log(`Starting real TTS stream: topic=${topic}, session=${session_id}`);

  const script = GREEK_SCRIPT;
  const text = script.text;
  const images = script.images;

  const startTime = Date.now();
  let frameId = 0;
  let currentTimeOffset = 0;
  let wordCount = 0;

  const preloaded = new Set();
  const shown = new Set();

  const words = text.split(/\s+/);
  const totalWords = words.length;

  // Check cache first
  const cachedAudio = loadFromCache(text);
  if (cachedAudio) {
    // Stream from cache
    streamCachedAudio(ws, cachedAudio, images, startTime, totalWords, text, session_id);
    return;
  }

  // Generate new audio
  console.log(`🔊 Generating new TTS audio for topic: ${topic}`);

  // Try to use espeak if available (Linux/Fedora)
  // Falls back to generating mock PCM if espeak not available
  let ttsProcess;
  let audioStream;
  let useMockAudio = false;
  const audioChunks = []; // Collect chunks for caching

  try {
    // espeak command: output PCM to stdout
    // -v en: English voice
    // --stdout: output to stdout
    // -s 150: speed (words per minute)
    // -a 200: amplitude (volume)
    ttsProcess = spawn('espeak', [
      '-v', 'en',
      '--stdout',
      '-s', '150',  // Speed
      '-a', '200',  // Amplitude
      text
    ]);

    // Handle espeak errors (not available on Windows)
    ttsProcess.on('error', (error) => {
      console.warn('espeak not available, using mock PCM:', error.message);
      if (!useMockAudio) {
        useMockAudio = true;
        audioStream = createMockPCMStream(text.length);
        setupAudioHandlers();
      }
    });

    audioStream = ttsProcess.stdout;
    console.log('Using espeak TTS engine');

  } catch (error) {
    console.warn('espeak spawn failed, using mock PCM:', error.message);
    useMockAudio = true;
    audioStream = createMockPCMStream(text.length);
  }

  function setupAudioHandlers() {
    // Stream audio chunks
    const CHUNK_SIZE = 960; // 20ms at 48kHz mono (960 samples)

    audioStream.on('data', (chunk) => {
    if (ws.readyState !== WebSocket.OPEN) {
      if (ttsProcess) ttsProcess.kill();
      return;
    }

    // Collect chunks for caching
    audioChunks.push(chunk);

    const playoutTs = startTime + currentTimeOffset;

    // Send audio frame
    ws.send(JSON.stringify({
      type: 'audio_frame',
      frame_id: frameId,
      format: 'pcm',
      sample_rate: 48000,
      channels: 1,
      bits_per_sample: 16,
      data_base64: chunk.toString('base64'),
      playout_ts: playoutTs
    }));

    // Calculate current word position (rough estimate)
    const chunkDurationMs = (chunk.length / 2) / 48000 * 1000; // 2 bytes per sample
    const wordsPerMs = totalWords / (text.length * 5); // Rough estimate: 5ms per character
    wordCount += chunkDurationMs * wordsPerMs;

    // Check for image preload/show
    for (const img of images) {
      const { id, show_at_word } = img;

      // Preload 5 words before show
      if (wordCount >= (show_at_word - 5) && !preloaded.has(id)) {
        ws.send(JSON.stringify({
          type: 'img_preload',
          id,
          cdn_url: img.cdn_url,
          ttl_ms: 10000,
          playout_ts: playoutTs,
          offset: 0
        }));
        preloaded.add(id);
        console.log(`Preloaded: ${id} at word ${Math.floor(wordCount)}`);
      }

      // Show image
      if (wordCount >= show_at_word && !shown.has(id)) {
        ws.send(JSON.stringify({
          type: 'img_show',
          id,
          transition: 'crossfade',
          duration_ms: 400,
          caption: img.caption,
          credit: img.credit,
          playout_ts: playoutTs,
          offset: 0
        }));
        shown.add(id);
        console.log(`Showing: ${id} at word ${Math.floor(wordCount)}`);
      }
    }

    currentTimeOffset += chunkDurationMs;
    frameId++;
  });

  audioStream.on('end', () => {
    // Save to cache
    if (audioChunks.length > 0) {
      const fullAudioBuffer = Buffer.concat(audioChunks);
      saveToCacheAsync(text, fullAudioBuffer);
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'end_of_stream',
        session_id
      }));
      console.log(`TTS stream completed: ${frameId} frames, ${wordCount.toFixed(0)} words`);
    }
  });

  audioStream.on('error', (error) => {
    console.error('Audio stream error:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

    // Cleanup on client disconnect
    ws.on('close', () => {
      if (ttsProcess) {
        ttsProcess.kill();
      }
    });
  }

  // Setup handlers if not using mock audio initially
  if (!useMockAudio) {
    setupAudioHandlers();
  }
}

// Create mock PCM stream for fallback
function createMockPCMStream(textLength) {
  const SAMPLE_RATE = 48000;
  const DURATION_SECONDS = Math.max(5, textLength / 20); // Rough estimate: 20 chars per second
  const TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SECONDS;
  const CHUNK_SIZE = 960; // 20ms chunks

  let samplesGenerated = 0;

  const stream = new Readable({
    read() {
      if (samplesGenerated >= TOTAL_SAMPLES) {
        this.push(null); // End stream
        return;
      }

      const buffer = Buffer.alloc(CHUNK_SIZE * 2); // 2 bytes per sample (16-bit)

      // Generate simple sine wave for mock audio
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const sample = Math.floor(Math.sin(2 * Math.PI * 440 * (samplesGenerated + i) / SAMPLE_RATE) * 8000);
        buffer.writeInt16LE(sample, i * 2);
      }

      samplesGenerated += CHUNK_SIZE;
      this.push(buffer);
    }
  });

  return stream;
}

/**
 * Synthesize arbitrary text for conversational responses
 * Simplified version without image sync
 */
async function synthesizeText(ws, config = {}) {
  const { text, session_id = 'default' } = config;

  if (!text) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'No text provided for synthesis'
    }));
    return;
  }

  const engine = USE_OPENAI ? 'openai-tts-1' : (USE_ELEVENLABS ? 'elevenlabs' : 'espeak/mock');
  console.log(`Synthesizing text (${text.length} chars, session=${session_id}, engine=${engine})`);

  const startTime = Date.now();
  let frameId = 0;
  let currentTimeOffset = 0;

  // Check cache first
  const cachedAudio = loadFromCache(text);
  if (cachedAudio) {
    console.log('✅ Using cached audio');
    streamCachedAudioSimple(ws, cachedAudio, startTime, session_id);
    return;
  }

  // Generate new audio
  let ttsProcess;
  let audioStream;
  let useMockAudio = false;
  const audioChunks = [];

  // Try OpenAI TTS-1 first (primary)
  if (USE_OPENAI) {
    try {
      audioStream = await synthesizeWithOpenAI(text);
      console.log('✅ Using OpenAI TTS-1 engine');
    } catch (error) {
      console.error('❌ OpenAI TTS failed:', error.message);
      console.log('Falling back to espeak/mock');
      // Fall through to espeak/mock
    }
  }

  // Try espeak if OpenAI failed or not configured
  if (!audioStream) {
    try {
      ttsProcess = spawn('espeak', [
        '-v', 'en',
        '--stdout',
        '-s', '150',
        '-a', '200',
        text
      ]);

      ttsProcess.on('error', (error) => {
        if (!useMockAudio) {
          console.warn('espeak not available, using mock PCM');
          useMockAudio = true;
          audioStream = createMockPCMStream(text.length);
          setupSimpleAudioHandlers();
        }
      });

      audioStream = ttsProcess.stdout;
      console.log('Using espeak TTS engine');

    } catch (error) {
      console.warn('espeak spawn failed, using mock PCM');
      useMockAudio = true;
      audioStream = createMockPCMStream(text.length);
    }
  }

  function setupSimpleAudioHandlers() {
    audioStream.on('data', (chunk) => {
      if (ws.readyState !== WebSocket.OPEN) {
        if (ttsProcess) ttsProcess.kill();
        return;
      }

      audioChunks.push(chunk);

      const playoutTs = startTime + currentTimeOffset;

      // Send audio frame
      ws.send(JSON.stringify({
        type: 'audio_frame',
        frame_id: frameId,
        format: 'pcm',
        sample_rate: 48000,
        channels: 1,
        bits_per_sample: 16,
        data_base64: chunk.toString('base64'),
        playout_ts: playoutTs
      }));

      const chunkDurationMs = (chunk.length / 2) / 48000 * 1000;
      currentTimeOffset += chunkDurationMs;
      frameId++;
    });

    audioStream.on('end', () => {
      // Save to cache
      if (audioChunks.length > 0) {
        const fullAudioBuffer = Buffer.concat(audioChunks);
        saveToCacheAsync(text, fullAudioBuffer);
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'end_of_stream',
          session_id
        }));
        console.log(`✅ Synthesis complete: ${frameId} frames`);
      }
    });

    audioStream.on('error', (error) => {
      console.error('Audio stream error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    });

    ws.on('close', () => {
      if (ttsProcess) {
        ttsProcess.kill();
      }
    });
  }

  if (!useMockAudio) {
    setupSimpleAudioHandlers();
  } else {
    setupSimpleAudioHandlers();
  }
}

/**
 * Stream cached audio without image sync
 */
function streamCachedAudioSimple(ws, audioBuffer, startTime, session_id) {
  const CHUNK_SIZE = 1920;
  let offset = 0;
  let frameId = 0;
  let currentTimeOffset = 0;

  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }

    if (offset >= audioBuffer.length) {
      clearInterval(interval);

      ws.send(JSON.stringify({
        type: 'end_of_stream',
        session_id
      }));
      console.log(`✅ Cached stream completed: ${frameId} frames`);
      return;
    }

    const chunkEnd = Math.min(offset + CHUNK_SIZE, audioBuffer.length);
    const chunk = audioBuffer.slice(offset, chunkEnd);
    offset = chunkEnd;

    const playoutTs = startTime + currentTimeOffset;

    ws.send(JSON.stringify({
      type: 'audio_frame',
      frame_id: frameId,
      format: 'pcm',
      sample_rate: 48000,
      channels: 1,
      bits_per_sample: 16,
      data_base64: chunk.toString('base64'),
      playout_ts: playoutTs
    }));

    const chunkDurationMs = (chunk.length / 2) / 48000 * 1000;
    currentTimeOffset += chunkDurationMs;
    frameId++;
  }, 20);
}

wss.on('connection', (ws) => {
  console.log('Client connected to real TTS stream');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received:', data.type);

      if (data.type === 'start_stream') {
        // Stream narration with predefined script and images
        streamTTS(ws, data);
      } else if (data.type === 'synthesize_text') {
        // Synthesize arbitrary text (for conversational responses)
        synthesizeText(ws, data);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from real TTS stream');
  });
});

const server = app.listen(PORT, () => {
  console.log(`Real TTS service listening on port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

/**
 * Synthesize text using Deepgram TTS API
 * Returns MP3 buffer (converts from WAV)
 */
async function synthesizeWithDeepgram(text) {
  console.log(`🎤 Calling Deepgram TTS API (${text.length} chars, voice: ${DEEPGRAM_VOICE})`);

  try {
    const response = await deepgram.speak.request(
      { text },
      {
        model: DEEPGRAM_VOICE,
        encoding: 'linear16',
        sample_rate: 48000,
        container: 'wav'
      }
    );

    // Get the audio stream
    const stream = await response.getStream();
    if (!stream) {
      throw new Error('No audio stream returned from Deepgram');
    }

    // Collect chunks into buffer
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const wavBuffer = Buffer.concat(chunks);
    console.log(`✅ Received WAV audio from Deepgram: ${(wavBuffer.length / 1024).toFixed(1)}KB`);

    // Convert WAV to MP3 using ffmpeg
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-f', 'wav',
        '-i', 'pipe:0',
        '-f', 'mp3',
        '-ar', '48000',
        '-ac', '1',
        '-b:a', '128k',
        'pipe:1'
      ]);

      const mp3Chunks = [];
      ffmpeg.stdout.on('data', (chunk) => mp3Chunks.push(chunk));
      ffmpeg.stderr.on('data', () => {}); // Suppress ffmpeg logs

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          const mp3Buffer = Buffer.concat(mp3Chunks);
          console.log(`✅ Converted to MP3: ${(mp3Buffer.length / 1024).toFixed(1)}KB`);
          resolve(mp3Buffer);
        } else {
          reject(new Error(`FFmpeg conversion failed with code ${code}`));
        }
      });

      ffmpeg.stdin.write(wavBuffer);
      ffmpeg.stdin.end();
    });
  } catch (error) {
    console.error('❌ Deepgram TTS error:', error.message);
    throw error;
  }
}

// New endpoint to get MP3 directly
app.post('/synthesize', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  // Prioritize Deepgram if configured
  if (USE_DEEPGRAM && TTS_PROVIDER === 'deepgram') {
    try {
      const mp3Buffer = await synthesizeWithDeepgram(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.send(mp3Buffer);
    } catch (error) {
      console.error('❌ Deepgram synthesis failed:', error.message);
      console.log('Falling back to ElevenLabs...');
      // Fall through to ElevenLabs
    }
  }

  // Fallback to ElevenLabs if Deepgram fails or not configured
  if (USE_ELEVENLABS) {
    try {
      console.log(`🎤 Calling ElevenLabs API for direct synthesis (${text.length} chars)`);
      const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
      console.log(`🔍 Using ElevenLabs key: ${ELEVENLABS_API_KEY.substring(0, 15)}...`);
      const response = await fetch(elevenLabsUrl, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': ELEVENLABS_API_KEY.trim(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const mp3Buffer = await response.buffer();
      console.log(`✅ Sending MP3 audio from ElevenLabs: ${(mp3Buffer.length / 1024).toFixed(1)}KB`);
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.send(mp3Buffer);

    } catch (error) {
      console.error('❌ ElevenLabs direct synthesis failed:', error.message);
      // Fall through to OpenAI if ElevenLabs fails
    }
  }

  // Fallback to OpenAI if ElevenLabs is not used or fails
  if (USE_OPENAI && openai) {
    try {
      console.log(`🎤 Calling OpenAI TTS-1 API for direct synthesis (${text.length} chars)`);
      const mp3Response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3',
      });

      const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer());
      console.log(`✅ Sending MP3 audio from OpenAI: ${(mp3Buffer.length / 1024).toFixed(1)}KB`);
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.send(mp3Buffer);
    } catch (error) {
      console.error('❌ OpenAI direct synthesis failed:', error.message);
      return res.status(500).json({ error: 'Failed to synthesize audio with all providers' });
    }
  }

  // If neither is configured
  return res.status(500).json({ error: 'No TTS provider is configured' });
});
