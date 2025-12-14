#!/bin/bash
# Test script for Orchestrator session creation
# Usage: ./test-session.sh

echo -e "\033[0;36mTesting Orchestrator /start_session endpoint...\033[0m"

response=$(curl -s -X POST http://localhost:3000/start_session \
  -H "Content-Type: application/json" \
  -d '{"kiosk_id":"kiosk-001"}')

if [ $? -eq 0 ]; then
    echo -e "\n\033[0;32mSuccess! Session created:\033[0m"
    echo -e "\033[0;33mSession ID:\033[0m $(echo $response | grep -o '"session_id":"[^"]*' | cut -d'"' -f4)"
    echo -e "\033[0;33mRoom Name:\033[0m $(echo $response | grep -o '"room_name":"[^"]*' | cut -d'"' -f4)"
    echo -e "\033[0;33mLiveKit URL:\033[0m $(echo $response | grep -o '"livekit_url":"[^"]*' | cut -d'"' -f4)"

    token=$(echo $response | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    echo -e "\n\033[0;90mToken (first 50 chars):\033[0m ${token:0:50}..."
else
    echo -e "\n\033[0;31mError: Failed to connect to orchestrator\033[0m"
    exit 1
fi
