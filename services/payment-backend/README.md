# Payment Backend Service

UPI payment integration service using Razorpay or Cashfree PSP.

## Responsibilities

- Create UPI payment sessions via PSP API
- Generate QR codes and UPI deep links
- Handle PSP webhook callbacks for payment confirmation
- Sign payment_confirm messages with HMAC
- Manage payment session lifecycle and timeouts

## API Endpoints

### Payment Management
- `POST /create_session` - Create new payment session
- `GET /status/:payment_id` - Check payment status

### Webhooks
- `POST /webhooks/razorpay` - Razorpay webhook handler
- `POST /webhooks/cashfree` - Cashfree webhook handler

### Health
- `GET /health` - Health check

## Environment Variables

```
PSP_PROVIDER=razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
PAYMENT_SIGN_SECRET=
WEBHOOK_SECRET=
```

## Payment Flow

1. Client requests payment via orchestrator
2. Payment backend creates PSP session
3. Returns UPI URI and QR code to client
4. User pays via UPI app
5. PSP sends webhook to payment backend
6. Payment backend validates and signs confirmation
7. Signed payment_confirm sent to client via orchestrator

## Development

```bash
npm install
npm run dev
```

## Mock Payment Gateway (Dev Mode)

For development, use the mock payment gateway that simulates UPI webhooks:

```bash
npm run dev:mock
```
