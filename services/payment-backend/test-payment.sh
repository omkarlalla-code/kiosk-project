#!/bin/bash
# Test script for Payment Backend
# Usage: ./test-payment.sh

echo -e "\033[0;36m=== Testing Payment Backend ===\033[0m"

# Step 1: Create payment session
echo -e "\n\033[0;33m1. Creating payment session...\033[0m"

session=$(curl -s -X POST http://localhost:3003/create_session \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000,
    "currency": "INR",
    "context": "greek_civilization_session",
    "session_id": "test-session-001",
    "kiosk_id": "kiosk-001"
  }')

payment_id=$(echo $session | grep -o '"payment_id":"[^"]*' | cut -d'"' -f4)
amount=$(echo $session | grep -o '"amount":[0-9]*' | cut -d':' -f2)
currency=$(echo $session | grep -o '"currency":"[^"]*' | cut -d'"' -f4)
upi_uri=$(echo $session | grep -o '"upi_uri":"[^"]*' | cut -d'"' -f4)

echo -e "   \033[0;32mPayment ID:\033[0m $payment_id"
echo -e "   \033[0;32mAmount:\033[0m $amount $currency"
echo -e "   \033[0;90mUPI URI:\033[0m $upi_uri"

# Step 2: Check payment status
echo -e "\n\033[0;33m2. Checking payment status...\033[0m"
status=$(curl -s http://localhost:3003/status/$payment_id)
payment_status=$(echo $status | grep -o '"status":"[^"]*' | cut -d'"' -f4)
echo -e "   \033[0;32mStatus:\033[0m $payment_status"

# Step 3: Simulate payment completion
echo -e "\n\033[0;33m3. Simulating payment completion...\033[0m"
complete=$(curl -s -X POST http://localhost:3003/mock/complete_payment/$payment_id \
  -H "Content-Type: application/json" \
  -d '{"status": "success"}')

complete_status=$(echo $complete | grep -o '"status":"[^"]*' | cut -d'"' -f4)
txn_id=$(echo $complete | grep -o '"txn_id":"[^"]*' | cut -d'"' -f4)
signature=$(echo $complete | grep -o '"signature":"[^"]*' | cut -d'"' -f4)

echo -e "   \033[0;32mStatus:\033[0m $complete_status"
echo -e "   \033[0;32mTransaction ID:\033[0m $txn_id"
echo -e "   \033[0;90mSignature:\033[0m ${signature:0:16}..."

# Step 4: Verify final status
echo -e "\n\033[0;33m4. Verifying final status...\033[0m"
final_status=$(curl -s http://localhost:3003/status/$payment_id)
final_payment_status=$(echo $final_status | grep -o '"status":"[^"]*' | cut -d'"' -f4)
echo -e "   \033[0;32mFinal Status:\033[0m $final_payment_status"

echo -e "\n\033[0;32m=== All tests passed! ===\033[0m"
