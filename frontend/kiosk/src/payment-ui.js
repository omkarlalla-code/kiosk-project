/**
 * Payment UI
 * Handles payment QR display and confirmation
 */

export class PaymentUI {
  constructor(options) {
    this.modalEl = options.modalEl;
    this.qrEl = options.qrEl;
    this.amountEl = options.amountEl;
    this.statusEl = options.statusEl;
    this.timerEl = options.timerEl;

    this.currentPaymentId = null;
    this.signatureSecret = null; // Should be configured securely
    this.expiryTimer = null;
    this.expiryTimestamp = null;
  }

  showPayment(message) {
    const { payment_id, upi_uri, qr_base64, expires_at } = message;

    this.currentPaymentId = payment_id;
    this.expiryTimestamp = expires_at;

    // Display QR code
    this.qrEl.src = `data:image/png;base64,${qr_base64}`;

    // Show amount
    if (message.amount) {
      this.amountEl.textContent = `Amount: ₹${(message.amount / 100).toFixed(2)}`;
    }

    // Update status
    this.statusEl.textContent = 'Scan QR code to pay';
    this.statusEl.className = 'status-waiting';

    // Start countdown timer
    this.startCountdown(expires_at);

    // Show modal
    this.modalEl.style.display = 'flex';

    console.log('Payment UI shown:', payment_id);

    // Optional: Generate UPI deep link button
    const deepLinkBtn = document.createElement('button');
    deepLinkBtn.textContent = 'Pay with UPI App';
    deepLinkBtn.onclick = () => {
      window.location.href = upi_uri;
    };

    const modalContent = this.modalEl.querySelector('.modal-content');
    if (!modalContent.querySelector('.deep-link-btn')) {
      deepLinkBtn.className = 'deep-link-btn';
      modalContent.appendChild(deepLinkBtn);
    }
  }

  handleConfirmation(message) {
    const { payment_id, status, txn_id, signature } = message;

    if (payment_id !== this.currentPaymentId) {
      console.warn('Payment ID mismatch');
      return;
    }

    // Verify signature
    const isValid = this.verifySignature(payment_id, txn_id, status, signature);

    if (!isValid) {
      console.error('Invalid payment signature');
      this.showError('Payment verification failed');
      return;
    }

    if (status === 'success') {
      this.showSuccess(txn_id);
      setTimeout(() => {
        this.hide();
      }, 3000);
    } else {
      this.showError('Payment failed');
    }
  }

  verifySignature(paymentId, txnId, status, signature) {
    // TODO: Implement HMAC signature verification
    // For now, just accept (insecure for production)
    console.log('Verifying signature:', signature);
    return true;
  }

  showSuccess(txnId) {
    this.statusEl.textContent = `Payment successful! Txn: ${txnId}`;
    this.statusEl.className = 'status-success';
  }

  showError(message) {
    this.statusEl.textContent = message;
    this.statusEl.className = 'status-error';
  }

  startCountdown(expiresAt) {
    // Clear existing timer
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, expiresAt - now);

      if (remaining === 0) {
        clearInterval(this.expiryTimer);
        this.showError('Payment expired');
        setTimeout(() => this.hide(), 2000);
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      if (this.timerEl) {
        this.timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    };

    updateTimer();
    this.expiryTimer = setInterval(updateTimer, 1000);
  }

  cancel() {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }
    this.hide();
  }

  hide() {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }
    this.modalEl.style.display = 'none';
    this.currentPaymentId = null;
    this.expiryTimestamp = null;
  }
}
