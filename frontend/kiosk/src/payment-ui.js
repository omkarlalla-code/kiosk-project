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

    this.currentPaymentId = null;
    this.signatureSecret = null; // Should be configured securely
  }

  showPayment(message) {
    const { payment_id, upi_uri, qr_base64 } = message;

    this.currentPaymentId = payment_id;

    // Display QR code
    this.qrEl.src = `data:image/png;base64,${qr_base64}`;

    // Show amount
    if (message.amount) {
      this.amountEl.textContent = `Amount: ₹${message.amount}`;
    }

    // Update status
    this.statusEl.textContent = 'Waiting for payment...';
    this.statusEl.className = 'status-waiting';

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

  hide() {
    this.modalEl.style.display = 'none';
    this.currentPaymentId = null;
  }
}
