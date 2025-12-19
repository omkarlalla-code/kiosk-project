// Active State - Main Chat UI with STT, TTS, and synchronized images

const timerEl = document.getElementById('sessionTimer');
const imageBuffer1 = document.getElementById('imageBuffer1');
const imageBuffer2 = document.getElementById('imageBuffer2');
const imageCaptionEl = document.getElementById('imageCaption');
const sttFinalEl = document.getElementById('sttFinal');
const sttInterimEl = document.getElementById('sttInterim');

let config = null;
let sessionId = null;
let livekitRoom = null;
let recognition = null;
let isListening = false;
let currentBuffer = 1; // Toggle between buffer 1 and 2
let audioQueue = []; // Queue for audio responses during overlapping speech
let isPlayingAudio = false;

// Image sync system
const imageSync = {
  timeOffset: 0, // Server time - client time offset
  scheduledImages: new Map(), // id -> timeout

  init() {
    console.log('[IMAGE_SYNC] Initialized');
  },

  setTimeOffset(serverTime) {
    this.timeOffset = serverTime - performance.now();
    console.log(`[IMAGE_SYNC] Time offset: ${this.timeOffset.toFixed(1)}ms`);
  },

  scheduleImage(imageData, playoutTs) {
    const localPlayoutTime = playoutTs - this.timeOffset;
    const now = performance.now();
    const delayMs = localPlayoutTime - now;

    console.log(`[IMAGE_SYNC] Schedule ${imageData.id} in ${delayMs.toFixed(0)}ms`);

    if (delayMs > -100) { // Allow small negative delay for buffering
      const timeoutId = setTimeout(() => {
        this.showImage(imageData);
      }, Math.max(0, delayMs));

      this.scheduledImages.set(imageData.id, timeoutId);
    } else {
      console.warn(`[IMAGE_SYNC] Late by ${-delayMs.toFixed(0)}ms, showing immediately`);
      this.showImage(imageData);
    }
  },

  showImage(imageData) {
    // Two-buffer crossfade system
    const activeBuffer = currentBuffer === 1 ? imageBuffer1 : imageBuffer2;
    const inactiveBuffer = currentBuffer === 1 ? imageBuffer2 : imageBuffer1;

    // Load new image in inactive buffer
    inactiveBuffer.src = imageData.cdn_url || imageData.url;
    inactiveBuffer.onload = () => {
      // Crossfade
      activeBuffer.classList.remove('visible');
      inactiveBuffer.classList.add('visible');

      // Update caption
      imageCaptionEl.textContent = imageData.title || imageData.caption || '';

      // Swap buffers
      currentBuffer = currentBuffer === 1 ? 2 : 1;

      console.log(`[IMAGE_SYNC] Showing: ${imageData.id || imageData.title}`);
    };
  },

  clear() {
    this.scheduledImages.forEach(timeoutId => clearTimeout(timeoutId));
    this.scheduledImages.clear();
  }
};

// Initialize on load
(async function init() {
  config = await window.kiosk.getConfig();
  console.log('[ACTIVE] Config loaded:', config);

  // Initialize systems
  imageSync.init();

  // Connect to LiveKit
  await connectToLiveKit();

  // Start STT
  startSTT();

  // Listen for session timer updates
  window.kiosk.onSessionTimeUpdate((remaining) => {
    updateTimer(remaining);

    // Warning at 10 seconds
    if (remaining <= 10) {
      timerEl.classList.add('warning');
    }
  });

  console.log('[ACTIVE] Chat session started');
})();

async function connectToLiveKit() {
  try {
    console.log('[LIVEKIT] Creating session...');

    const response = await fetch(`${config.orchestratorUrl}/start_session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kiosk_id: config.kioskId })
    });

    if (!response.ok) throw new Error('Failed to create session');

    const { session_id, token, livekit_url, room_name } = await response.json();
    sessionId = session_id;

    console.log(`[LIVEKIT] Session: ${session_id}, Room: ${room_name}`);

    // Connect to LiveKit room
    livekitRoom = new LivekitClient.Room({
      adaptiveStream: true,
      dynacast: true
    });

    // Handle DataChannel messages
    livekitRoom.on(LivekitClient.RoomEvent.DataReceived, (payload, participant) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload));
        handleDataChannelMessage(message);
      } catch (error) {
        console.error('[DATACHANNEL] Parse error:', error);
      }
    });

    livekitRoom.on(LivekitClient.RoomEvent.Connected, () => {
      console.log('[LIVEKIT] Connected');
    });

    livekitRoom.on(LivekitClient.RoomEvent.Disconnected, () => {
      console.warn('[LIVEKIT] Disconnected');
    });

    await livekitRoom.connect(livekit_url, token);

  } catch (error) {
    console.error('[LIVEKIT] Connection error:', error);
  }
}

function handleDataChannelMessage(message) {
  console.log('[DATACHANNEL]', message.type, message);

  switch (message.type) {
    case 'time_sync':
      imageSync.setTimeOffset(message.server_time);
      break;

    case 'img_preload':
      // Preload in background
      const img = new Image();
      img.src = message.cdn_url || message.url;
      console.log(`[PRELOAD] ${message.id}`);
      break;

    case 'img_show':
      imageSync.scheduleImage(message, message.playout_ts);
      break;

    case 'end_chat':
      console.log('[END_CHAT] Signal from LLM');
      window.kiosk.endChatSignal();
      break;

    default:
      console.log('[DATACHANNEL] Unknown message type:', message.type);
  }
}

function startSTT() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error('[STT] Not supported');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    console.log('[STT] Started');
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      console.log(`[STT] Final: "${finalTranscript}"`);
      sttFinalEl.textContent = finalTranscript;
      sttInterimEl.textContent = '';

      // Send to LLM
      sendToLLM(finalTranscript);
    } else if (interimTranscript) {
      sttInterimEl.textContent = ' ' + interimTranscript;
    }
  };

  recognition.onerror = (event) => {
    console.error('[STT] Error:', event.error);
    if (event.error !== 'no-speech') {
      restartSTT();
    }
  };

  recognition.onend = () => {
    if (isListening) {
      console.log('[STT] Restarting...');
      recognition.start();
    }
  };

  recognition.start();
}

function stopSTT() {
  if (recognition) {
    isListening = false;
    recognition.stop();
    console.log('[STT] Stopped');
  }
}

function restartSTT() {
  stopSTT();
  setTimeout(() => startSTT(), 1000);
}

async function sendToLLM(userMessage) {
  try {
    console.log(`[LLM] Sending: "${userMessage}"`);

    const response = await fetch(`${config.orchestratorUrl}/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: userMessage
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.statusText}`);
    }

    const data = await response.json();

    console.log(`[LLM] Response: "${data.assistant_response}"`);

    // Check for end-chat signal in response
    if (data.end_chat) {
      console.log('[LLM] End chat signal in response');
      setTimeout(() => window.kiosk.endChatSignal(), 2000);
    }

    // Queue or play audio
    if (data.audio_base64) {
      queueAudio(data.audio_base64);
    }

  } catch (error) {
    console.error('[LLM] Error:', error);
    sttFinalEl.textContent = 'Error communicating with AI';
    setTimeout(() => sttFinalEl.textContent = '', 3000);
  }
}

function queueAudio(audioBase64) {
  audioQueue.push(audioBase64);
  console.log(`[AUDIO_QUEUE] Added (queue size: ${audioQueue.length})`);

  // Start playing if not already playing
  if (!isPlayingAudio) {
    playNextInQueue();
  }
}

async function playNextInQueue() {
  if (audioQueue.length === 0) {
    isPlayingAudio = false;
    console.log('[AUDIO_QUEUE] Queue empty');
    return;
  }

  isPlayingAudio = true;
  const audioBase64 = audioQueue.shift();

  try {
    console.log('[AUDIO] Decoding and playing...');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Decode base64
    const binaryString = atob(audioBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);

    // Play it
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    source.onended = () => {
      console.log('[AUDIO] Playback ended');
      // Play next in queue
      setTimeout(() => playNextInQueue(), 100);
    };

    source.start(0);
    console.log(`[AUDIO] Playing (${(audioBuffer.duration).toFixed(1)}s)`);

  } catch (error) {
    console.error('[AUDIO] Playback error:', error);
    // Try next in queue on error
    setTimeout(() => playNextInQueue(), 100);
  }
}

function updateTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  stopSTT();
  imageSync.clear();
  if (livekitRoom) {
    livekitRoom.disconnect();
  }
});

console.log('[ACTIVE] Active state loaded');
