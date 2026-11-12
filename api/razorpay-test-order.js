const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const keyId = process.env.RAZORPAY_TEST_KEY_ID;
  const keySecret = process.env.RAZORPAY_TEST_KEY_SECRET;
  if (!keyId || !keySecret || !keyId.startsWith('rzp_test_')) {
    return res.status(503).json({ error: 'Razorpay Test Mode keys are not configured correctly.' });
  }

  try {
    // Fixed ₹1 test order. Never accept an amount from the browser.
    const receipt = 'cvtest_' + crypto.randomBytes(8).toString('hex');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: 100,
        currency: 'INR',
        receipt,
        notes: { purpose: 'CartVanta Razorpay integration test; not a customer order' }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.id) {
      return res.status(502).json({
        error: data.error?.description || 'Could not create Razorpay test order.',
        code: data.error?.code || null
      });
    }
    return res.status(200).json({
      keyId,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      testMode: true
    });
  } catch (_) {
    return res.status(502).json({ error: 'Razorpay test service is temporarily unavailable.' });
  }
};
