const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.RAZORPAY_TEST_KEY_SECRET;
  if (!secret) return res.status(503).json({ error: 'Razorpay Test Mode secret is not configured.' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (
    typeof razorpay_order_id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(razorpay_order_id) ||
    typeof razorpay_payment_id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(razorpay_payment_id) ||
    typeof razorpay_signature !== 'string' || !/^[a-f0-9]{64}$/i.test(razorpay_signature)
  ) {
    return res.status(400).json({ verified: false, error: 'Invalid payment verification details.' });
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(razorpay_signature, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ verified: false, error: 'Payment signature verification failed.' });
  }

  return res.status(200).json({
    verified: true,
    testMode: true,
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    message: 'Razorpay test payment signature verified. This is not a customer order.'
  });
};
