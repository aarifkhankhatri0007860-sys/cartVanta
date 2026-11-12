module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'CJ_API_KEY is not configured in Vercel.' });
  try {
    const auth = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
    });
    const authJson = await auth.json().catch(() => ({}));
    const token = authJson?.data?.accessToken;
    if (!auth.ok || authJson.code !== 200 || !token) return res.status(502).json({ error: 'CJ authentication failed.' });
    const response = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/getCategory', { headers: { 'CJ-Access-Token': token } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.code !== 200 || !Array.isArray(json.data)) return res.status(502).json({ error: 'CJ category list is unavailable.' });
    const categories = [];
    for (const first of json.data) for (const second of (first.categoryFirstList || [])) for (const third of (second.categorySecondList || [])) {
      if (third.categoryId && third.categoryName) categories.push({
        id: String(third.categoryId), name: String(third.categoryName),
        parent: String(second.categorySecondName || ''), department: String(first.categoryFirstName || '')
      });
    }
    return res.status(200).json({ categories, count: categories.length, source: 'CJ Dropshipping' });
  } catch (_) { return res.status(500).json({ error: 'Unable to contact CJ category service.' }); }
};