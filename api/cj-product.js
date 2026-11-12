module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=240');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const pid = String(req.query.pid || '').trim();
  const market = String(req.query.market || 'US').toUpperCase().slice(0,2);
  if (!/^[A-Z0-9-]{6,80}$/i.test(pid)) return res.status(400).json({ error: 'A valid product ID is required.' });
  if (!/^[A-Z]{2}$/.test(market)) return res.status(400).json({ error: 'Invalid destination country.' });
  const warehouseCountry = market === 'US' ? 'US' : 'CN';
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'CJ_API_KEY is not configured in Vercel.' });
  try {
    const auth = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
    });
    const authJson = await auth.json().catch(() => ({}));
    const token = authJson?.data?.accessToken;
    if (!auth.ok || authJson.code !== 200 || !token) return res.status(502).json({ error: 'CJ authentication failed.', stage: 'authentication' });
    const url = 'https://developers.cjdropshipping.com/api2.0/v1/product/query?' + new URLSearchParams({ pid, countryCode: warehouseCountry, features: 'enable_video' });
    const response = await fetch(url, { headers: { 'CJ-Access-Token': token } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.code !== 200 || !json.data) return res.status(404).json({ error: 'Product details are unavailable for this destination.', stage: 'product-query', cjMessage: json.message || null });
    const p = json.data;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const availableVariants = variants.map(v => {
      const inv = Array.isArray(v.inventories) ? v.inventories.find(x => String(x.countryCode || '').toUpperCase() === warehouseCountry) : null;
      const cjStock = Number(inv?.cjInventory ?? 0);
      return {
        id: v.vid || null, sku: v.variantSku || null, name: v.variantNameEn || p.productNameEn || '',
        key: v.variantKey || '', price: Number(v.variantSellPrice ?? p.sellPrice ?? 0),
        stock: Number.isFinite(cjStock) ? cjStock : 0,
        inStock: Number.isFinite(cjStock) && cjStock > 0
      };
    }).filter(v => v.id && v.sku);
    const images = [...new Set([p.bigImage, ...(Array.isArray(p.productImageSet) ? p.productImageSet : [])].filter(x => typeof x === 'string' && /^https:\/\//i.test(x)))].slice(0, 12);
    return res.status(200).json({
      product: {
        id: p.pid, sku: p.productSku, name: p.productNameEn || 'CJ product',
        description: typeof p.description === 'string' ? p.description : '',
        category: p.categoryName || '', image: p.bigImage || images[0] || '',
        images, weightGrams: Number(p.productWeight || 0), supplierPrice: Number(p.sellPrice || 0),
        currency: 'USD', market, warehouseCountry, shippingNeedsQuote: warehouseCountry !== market, variants: availableVariants,
        available: availableVariants.some(v => v.inStock),
        videoAvailable: Boolean(p.isVideo || (Array.isArray(p.videoList) && p.videoList.length))
      },
      requestId: json.requestId || null
    });
  } catch (_) {
    return res.status(500).json({ error: 'Unable to contact CJ product service right now.' });
  }
};