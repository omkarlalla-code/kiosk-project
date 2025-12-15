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
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

// Ollama configuration (FREE - runs locally!)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

// In-memory conversation store (use Redis in production)
const conversations = new Map();

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
    provider: 'ollama',
    model: OLLAMA_MODEL,
    ollama_url: OLLAMA_URL,
    active_conversations: conversations.size,
    prompt_loaded: systemPrompt.length > 0,
    cost: 'FREE!'
  });
});

// POST /chat - Send message and get Ollama response
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

    // Build Ollama messages format (with system prompt)
    const ollamaMessages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...history
    ];

    // Call Ollama API
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama error: ${ollamaResponse.statusText}`);
    }

    const data = await ollamaResponse.json();
    const assistantMessage = data.message.content;

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
      model: OLLAMA_MODEL,
      cost: 'FREE!'
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
    console.log(`\n🤖 LLM Service (Ollama - FREE!)`);
    console.log(`📡 Listening on port ${PORT}`);
    console.log(`🧠 Model: ${OLLAMA_MODEL}`);
    console.log(`🌐 Ollama: ${OLLAMA_URL}`);
    console.log(`📝 System prompt: ${systemPrompt.length} chars`);
    console.log(`💰 Cost: $0.00 (runs locally!)`);
    console.log(`\n💡 Edit prompt: services/llm/system-prompt.txt`);
    console.log(`   Then POST to /reload-prompt to apply changes\n`);
  });
}

start();
