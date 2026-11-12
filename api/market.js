module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const header = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(header) ? header : '';
  return res.status(200).json({ country: country || 'US', detected: Boolean(country), source: country ? 'vercel-edge-country' : 'fallback' });
};