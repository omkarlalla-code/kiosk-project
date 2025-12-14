/**
 * Payment Backend Service
 *
 * Responsibilities:
 * - Create UPI payment sessions via PSP (Razorpay/Cashfree)
 * - Handle PSP webhooks for payment confirmation
 * - Generate signed payment_confirm messages
 * - Manage payment session lifecycle
 * - Mock payment gateway for testing
 */

require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3003;
const PSP_PROVIDER = process.env.PSP_PROVIDER || 'mock';
const PAYMENT_SIGN_SECRET = process.env.PAYMENT_SIGN_SECRET || 'dev-secret-key';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';

// Razorpay configuration
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

let razorpayInstance = null;
if (PSP_PROVIDER === 'razorpay' && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
  });
  console.log('Razorpay initialized');
}

app.use(express.json());

// In-memory payment session store
const paymentSessions = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payment-backend', provider: PSP_PROVIDER });
});

// POST /create_session - Create UPI payment session
app.post('/create_session', async (req, res) => {
  try {
    const { amount, currency, context, session_id, kiosk_id } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({ error: 'amount and currency are required' });
    }

    if (PSP_PROVIDER === 'razorpay' && razorpayInstance) {
      // Razorpay integration
      const options = {
        amount: amount, // Amount in paise
        currency: currency,
        receipt: `rcpt_${crypto.randomBytes(6).toString('hex')}`,
        payment_capture: 1,
        notes: {
          context,
          session_id,
          kiosk_id
        }
      };

      const order = await razorpayInstance.orders.create(options);

      // Store payment session
      paymentSessions.set(order.id, {
        payment_id: order.id,
        amount,
        currency,
        context,
        session_id,
        kiosk_id,
        status: 'pending',
        created_at: Date.now(),
        expires_at: Date.now() + 300000, // 5 minutes
        provider: 'razorpay',
        order_id: order.id
      });

      console.log(`Created Razorpay order ${order.id} for ${amount} ${currency}`);

      // Generate UPI payment link
      const upi_uri = `upi://pay?pa=${RAZORPAY_KEY_ID}@razorpay&pn=Kiosk&am=${amount / 100}&cu=${currency}&tr=${order.id}`;
      const qr_base64 = generateMockQR(upi_uri); // In production, use actual QR library

      res.json({
        payment_id: order.id,
        upi_uri,
        qr_base64,
        amount,
        currency,
        expires_at: Date.now() + 300000,
        provider: 'razorpay'
      });
    } else {
      // Mock payment gateway
      const payment_id = `pay_${crypto.randomBytes(8).toString('hex')}`;
      const expires_at = Date.now() + 300000; // 5 minutes

      // Generate UPI URI and QR code (mock)
      const upi_uri = `upi://pay?pa=merchant@upi&pn=Kiosk&am=${amount / 100}&cu=${currency}&tr=${payment_id}`;
      const qr_base64 = generateMockQR(upi_uri);

      // Store payment session
      paymentSessions.set(payment_id, {
        payment_id,
        amount,
        currency,
        context,
        session_id,
        kiosk_id,
        status: 'pending',
        created_at: Date.now(),
        expires_at,
        upi_uri,
        provider: 'mock'
      });

      console.log(`Created mock payment session ${payment_id} for ${amount} ${currency}`);

      res.json({
        payment_id,
        upi_uri,
        qr_base64,
        amount,
        currency,
        expires_at,
        provider: 'mock'
      });
    }
  } catch (error) {
    console.error('Error creating payment session:', error);
    res.status(500).json({ error: 'Failed to create payment session' });
  }
});

// GET /status/:payment_id - Check payment status
app.get('/status/:payment_id', (req, res) => {
  const { payment_id } = req.params;
  const session = paymentSessions.get(payment_id);

  if (!session) {
    return res.status(404).json({ error: 'Payment session not found' });
  }

  res.json({
    payment_id: session.payment_id,
    status: session.status,
    amount: session.amount,
    currency: session.currency,
    created_at: session.created_at,
    expires_at: session.expires_at,
  });
});

// POST /webhooks/mock - Mock webhook endpoint (simulates PSP callback)
app.post('/webhooks/mock', async (req, res) => {
  try {
    const { payment_id, status } = req.body;

    console.log(`Received mock webhook: ${payment_id} - ${status}`);

    const session = paymentSessions.get(payment_id);

    if (!session) {
      return res.status(404).json({ error: 'Payment session not found' });
    }

    // Update session status
    session.status = status;
    session.updated_at = Date.now();

    if (status === 'success') {
      const txn_id = `txn_${crypto.randomBytes(6).toString('hex')}`;
      session.txn_id = txn_id;

      // Sign payment confirmation
      const signature = signPaymentConfirm(payment_id, txn_id, status);

      // Send payment_confirm to orchestrator (which forwards to kiosk)
      const confirmMessage = {
        type: 'payment_confirm',
        payment_id,
        status,
        txn_id,
        amount: session.amount,
        signature,
      };

      console.log(`Payment confirmed: ${payment_id}, txn: ${txn_id}`);
      console.log('Confirmation message:', confirmMessage);

      // TODO: Send to orchestrator to forward to kiosk via DataChannel
      // For now, just store it
      session.confirmation = confirmMessage;
    }

    res.json({ received: true, status: session.status });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /webhooks/razorpay - Razorpay webhook handler
app.post('/webhooks/razorpay', async (req, res) => {
  try {
    console.log('Received Razorpay webhook');

    // Verify webhook signature
    const webhookSignature = req.headers['x-razorpay-signature'];

    if (RAZORPAY_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (webhookSignature !== expectedSignature) {
        console.error('Invalid Razorpay webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`Razorpay event: ${event}`);

    // Handle payment success
    if (event === 'payment.captured' || event === 'payment.authorized') {
      const payment = payload.payment.entity;
      const order_id = payment.order_id;

      const session = paymentSessions.get(order_id);

      if (!session) {
        console.error(`Payment session not found for order ${order_id}`);
        return res.status(404).json({ error: 'Payment session not found' });
      }

      // Update session status
      session.status = 'success';
      session.updated_at = Date.now();
      session.txn_id = payment.id;
      session.razorpay_payment_id = payment.id;

      // Sign payment confirmation
      const signature = signPaymentConfirm(order_id, payment.id, 'success');

      // Create confirmation message
      const confirmMessage = {
        type: 'payment_confirm',
        payment_id: order_id,
        status: 'success',
        txn_id: payment.id,
        amount: session.amount,
        signature,
      };

      console.log(`Razorpay payment confirmed: ${order_id}, txn: ${payment.id}`);

      // TODO: Send to orchestrator to forward to kiosk via DataChannel
      session.confirmation = confirmMessage;

      res.json({ received: true, status: 'success' });
    } else if (event === 'payment.failed') {
      const payment = payload.payment.entity;
      const order_id = payment.order_id;

      const session = paymentSessions.get(order_id);

      if (session) {
        session.status = 'failed';
        session.updated_at = Date.now();
        session.error = payment.error_description;

        console.log(`Razorpay payment failed: ${order_id}`);
      }

      res.json({ received: true, status: 'failed' });
    } else {
      console.log(`Unhandled Razorpay event: ${event}`);
      res.json({ received: true });
    }
  } catch (error) {
    console.error('Error processing Razorpay webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /webhooks/cashfree - Cashfree webhook handler
app.post('/webhooks/cashfree', async (req, res) => {
  console.log('Received Cashfree webhook:', req.body);
  // TODO: Implement Cashfree signature verification
  res.json({ received: true });
});

// Mock endpoint to trigger payment success (for testing)
app.post('/mock/complete_payment/:payment_id', async (req, res) => {
  const { payment_id } = req.params;
  const { status = 'success' } = req.body;

  console.log(`Mock: Completing payment ${payment_id} with status ${status}`);

  // Trigger webhook to ourselves
  try {
    const webhookResponse = await fetch(`http://localhost:${PORT}/webhooks/mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id, status }),
    });

    const result = await webhookResponse.json();

    const session = paymentSessions.get(payment_id);

    res.json({
      message: 'Payment completed',
      payment_id,
      status,
      confirmation: session?.confirmation,
    });
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all payment sessions (debugging)
app.get('/sessions', (req, res) => {
  const sessions = Array.from(paymentSessions.values());
  res.json({ sessions, count: sessions.length });
});

app.listen(PORT, () => {
  console.log(`Payment Backend service listening on port ${PORT}`);
  console.log(`Provider: ${PSP_PROVIDER}`);
});

/**
 * Sign payment confirmation message
 */
function signPaymentConfirm(paymentId, txnId, status) {
  const payload = JSON.stringify({ paymentId, txnId, status });
  const signature = crypto
    .createHmac('sha256', PAYMENT_SIGN_SECRET)
    .update(payload)
    .digest('hex');
  return signature;
}

/**
 * Generate mock QR code (base64 PNG)
 * In production, use a real QR code library or PSP-provided QR
 */
function generateMockQR(data) {
  // This is a tiny 1x1 transparent PNG in base64
  // In reality, you'd use a QR code library like 'qrcode'
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
}

module.exports = { signPaymentConfirm };
