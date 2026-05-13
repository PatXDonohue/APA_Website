// Elavon payment gateway adapter.
// Default mode = 'mock' for development. Swap ELAVON_MODE=live and fill in
// merchant credentials in .env to call the real Elavon Converge API.

const MODE = process.env.ELAVON_MODE || 'mock';

async function charge({ amountCents, last4, name }) {
  if (MODE === 'mock') {
    // Simulate latency + always approve
    await new Promise(r => setTimeout(r, 250));
    return {
      ok: true,
      approved: true,
      reference: 'MOCK-' + Date.now(),
      mode: 'mock',
    };
  }
  // Live mode placeholder. Replace this block with real Elavon Converge call.
  // Required env: ELAVON_MERCHANT_ID, ELAVON_USER_ID, ELAVON_PIN
  // Endpoint reference: https://developer.elavon.com/products/converge
  throw new Error('Elavon live mode is not yet wired. See lib/elavon.js.');
}

module.exports = { charge, MODE };
