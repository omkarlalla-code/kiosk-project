/**
 * Payment Backend Service
 *
 * Responsibilities:
 * - Create UPI payment sessions via PSP (Razorpay/Cashfree)
 * - Handle PSP webhooks for payment confirmation
 * - Generate signed payment_confirm messages
 * - Manage payment session lifecycle
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payment-backend' });
});

// TODO: Implement endpoints
// POST /create_session - Create UPI payment session
// POST /webhooks/razorpay - Receive Razorpay webhooks
// POST /webhooks/cashfree - Receive Cashfree webhooks
// GET /status/:payment_id - Check payment status

app.listen(PORT, () => {
  console.log(`Payment Backend service listening on port ${PORT}`);
});

/**
 * Sign payment confirmation message
 */
function signPaymentConfirm(paymentId, txnId, status) {
  const secret = process.env.PAYMENT_SIGN_SECRET;
  const payload = JSON.stringify({ paymentId, txnId, status });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature;
}

module.exports = { signPaymentConfirm };
