FROM node:20-alpine

# Install espeak for TTS (Linux/Fedora compatible)
RUN apk add --no-cache espeak python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/

# Create cache directory
RUN mkdir -p /app/cache/tts && chmod 777 /app/cache/tts

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start service
CMD ["node", "src/index.js"]
