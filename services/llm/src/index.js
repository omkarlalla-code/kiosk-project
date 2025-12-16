/**
 * LLM Service - Claude API Integration
 *
 * Handles conversational AI for the Greek Civilization Kiosk
 * - Loads editable system prompt from file
 * - Manages conversation history per session
 * - Streams responses for natural TTS integration
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

// Groq configuration (FREE tier - fast inference!)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// In-memory conversation store (use Redis in production)
const conversations = new Map();

// Response cache for faster replies (5 minute TTL)
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(sessionId, message) {
  return `${sessionId}:${message.toLowerCase().trim()}`;
}

function getCachedResponse(sessionId, message) {
  const key = getCacheKey(sessionId, message);
  const cached = responseCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`💾 Cache hit for: "${message}"`);
    return cached.response;
  }

  return null;
}

function cacheResponse(sessionId, message, response) {
  const key = getCacheKey(sessionId, message);
  responseCache.set(key, {
    response,
    timestamp: Date.now()
  });
}

// Load system prompt from file
let systemPrompt = '';

async function loadSystemPrompt() {
  try {
    const promptPath = path.join(__dirname, '..', 'system-prompt.txt');
    systemPrompt = await fs.readFile(promptPath, 'utf-8');
    console.log('✅ System prompt loaded from system-prompt.txt');
    console.log(`📝 Prompt length: ${systemPrompt.length} characters`);
  } catch (error) {
    console.error('❌ Failed to load system prompt:', error.message);
    systemPrompt = 'You are a helpful assistant for a Greek Civilization museum kiosk.';
  }
}

// Reload system prompt endpoint (for easy editing)
app.post('/reload-prompt', async (req, res) => {
  await loadSystemPrompt();
  res.json({
    success: true,
    message: 'System prompt reloaded',
    prompt_length: systemPrompt.length
  });
});

// Get current system prompt (for viewing/editing)
app.get('/system-prompt', (req, res) => {
  res.json({
    prompt: systemPrompt,
    path: path.join(__dirname, '..', 'system-prompt.txt')
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'llm',
    provider: 'groq',
    model: GROQ_MODEL,
    active_conversations: conversations.size,
    cached_responses: responseCache.size,
    prompt_loaded: systemPrompt.length > 0,
    cost: 'FREE! (Generous free tier)',
    speed: 'FAST! (Groq optimized + caching)'
  });
});

// POST /chat - Send message and get Groq response
app.post('/chat', async (req, res) => {
  try {
    const { session_id, message, stream = false } = req.body;

    if (!session_id || !message) {
      return res.status(400).json({ error: 'session_id and message are required' });
    }

    // Get or create conversation history
    if (!conversations.has(session_id)) {
      conversations.set(session_id, []);
    }
    const history = conversations.get(session_id);

    // Add user message to history
    history.push({
      role: 'user',
      content: message
    });

    console.log(`💬 [${session_id}] User: ${message}`);

    // Check cache first
    const cachedResponse = getCachedResponse(session_id, message);
    let assistantMessage;
    let tokensUsed = 0;
    let fromCache = false;

    if (cachedResponse) {
      assistantMessage = cachedResponse;
      fromCache = true;
    } else {
      // Build messages with system prompt
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...history
      ];

      // Call Groq API with caching enabled
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024,
        // Groq automatically caches prompts for faster responses
      });

      assistantMessage = completion.choices[0].message.content;
      tokensUsed = completion.usage.total_tokens;

      // Cache the response
      cacheResponse(session_id, message, assistantMessage);
    }

    // Add assistant response to history
    history.push({
      role: 'assistant',
      content: assistantMessage
    });

    console.log(`🤖 [${session_id}] Assistant: ${assistantMessage}`);

    res.json({
      response: assistantMessage,
      session_id,
      conversation_length: history.length,
      model: GROQ_MODEL,
      cost: 'FREE!',
      tokens_used: tokensUsed,
      from_cache: fromCache
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear conversation history for a session
app.delete('/conversation/:session_id', (req, res) => {
  const { session_id } = req.params;

  if (conversations.has(session_id)) {
    conversations.delete(session_id);
    console.log(`🗑️ Cleared conversation for session: ${session_id}`);
  }

  res.json({ success: true, message: 'Conversation cleared' });
});

// Get conversation history
app.get('/conversation/:session_id', (req, res) => {
  const { session_id } = req.params;
  const history = conversations.get(session_id) || [];

  res.json({
    session_id,
    messages: history,
    count: history.length
  });
});

// Start server
async function start() {
  await loadSystemPrompt();

  app.listen(PORT, () => {
    console.log(`\n🤖 LLM Service (Groq - FREE & FAST!)`);
    console.log(`📡 Listening on port ${PORT}`);
    console.log(`🧠 Model: ${GROQ_MODEL}`);
    console.log(`⚡ Speed: Ultra-fast inference (Groq LPU)`);
    console.log(`📝 System prompt: ${systemPrompt.length} chars`);
    console.log(`💰 Cost: FREE (Generous free tier)`);
    console.log(`\n💡 Edit prompt: services/llm/system-prompt.txt`);
    console.log(`   Then POST to /reload-prompt to apply changes\n`);
  });
}

start();
