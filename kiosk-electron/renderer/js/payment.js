// Payment State - Operator selects duration based on tokens received

const paymentOptions = document.querySelectorAll('.payment-option');
const cancelBtn = document.querySelector('.payment-cancel');

// Handle payment option selection
paymentOptions.forEach(option => {
  option.addEventListener('click', () => {
    const duration = parseInt(option.dataset.duration);
    const price = parseInt(option.dataset.price);

    console.log(`[PAYMENT] Selected: ${duration}s for ₹${price}`);

    // Visual feedback
    option.style.background = '#ffffff';
    option.style.color = '#000000';

    setTimeout(() => {
      // Transition to active state with selected duration
      window.kiosk.gotoActive(duration);
    }, 200);
  });
});

// Cancel returns to idle
cancelBtn.addEventListener('click', () => {
  console.log('[PAYMENT] Cancelled');
  window.kiosk.gotoIdle();
});

console.log('[PAYMENT] Payment screen ready');
