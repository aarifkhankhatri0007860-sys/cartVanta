module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const pid = String(req.query.pid || '').trim();
  const market = String(req.query.market || 'US').toUpperCase();
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
    const token = authJson && authJson.data && authJson.data.accessToken;
    if (!auth.ok || authJson.code !== 200 || !token) return res.status(502).json({ error: 'CJ authentication failed.', stage: 'authentication' });
    const headers = { 'CJ-Access-Token': token };
    const detailUrl = 'https://developers.cjdropshipping.com/api2.0/v1/product/query?' + new URLSearchParams({ pid, features: 'enable_video' });
    const detailResponse = await fetch(detailUrl, { headers });
    const detailJson = await detailResponse.json().catch(() => ({}));
    if (!detailResponse.ok || detailJson.code !== 200 || !detailJson.data) {
      return res.status(404).json({ error: 'Product details are unavailable from CJ.', stage: 'product-query', cjMessage: detailJson.message || null });
    }
    const p = Array.isArray(detailJson.data) ? detailJson.data[0] : detailJson.data;
    const variantUrl = 'https://developers.cjdropshipping.com/api2.0/v1/product/variant/query?' + new URLSearchParams({ pid, countryCode: warehouseCountry });
    const variantResponse = await fetch(variantUrl, { headers });
    const variantJson = await variantResponse.json().catch(() => ({}));
    if (!variantResponse.ok || variantJson.code !== 200) {
      return res.status(502).json({ error: 'CJ variants could not be loaded.', stage: 'variant-query', cjMessage: variantJson.message || null });
    }
    const rawVariants = Array.isArray(variantJson.data) ? variantJson.data : [];
    const checked = [];
    for (let i = 0; i < Math.min(rawVariants.length, 30); i += 5) {
      const batch = rawVariants.slice(i, i + 5);
      const stockResults = await Promise.all(batch.map(async v => {
        if (!v.vid) return null;
        try {
          const stockUrl = 'https://developers.cjdropshipping.com/api2.0/v1/product/stock/queryByVid?vid=' + encodeURIComponent(v.vid);
          const stockResponse = await fetch(stockUrl, { headers });
          const stockJson = await stockResponse.json().catch(() => ({}));
          if (!stockResponse.ok || stockJson.code !== 200 || !Array.isArray(stockJson.data)) return null;
          const rows = stockJson.data.filter(x => String(x.countryCode || '').toUpperCase() === warehouseCountry);
          const stock = rows.reduce((sum, x) => sum + Number(x.cjInventoryNum || 0), 0);
          return {
            id: v.vid, sku: v.variantSku || null, name: v.variantNameEn || '',
            key: v.variantKey || v.variantNameEn || '', image: v.variantImage || null,
            price: Number(v.variantSellPrice || 0), stock: Number.isFinite(stock) ? stock : 0,
            inStock: Number.isFinite(stock) && stock > 0
          };
        } catch (_) { return null; }
      }));
      checked.push(...stockResults.filter(Boolean));
    }
    const imagesRaw = [p.bigImage, ...(Array.isArray(p.productImageSet) ? p.productImageSet : [])];
    const images = [...new Set(imagesRaw.filter(x => typeof x === 'string' && /^https:\/\//i.test(x)))].slice(0, 12);
    const description = typeof p.description === 'string' ? p.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000) : '';
    const available = checked.filter(v => v.inStock);
    return res.status(200).json({
      product: {
        id: p.pid || pid, sku: p.productSku || null, name: p.productNameEn || p.nameEn || 'CJ product',
        description, category: p.categoryName || p.threeCategoryName || '',
        image: images[0] || '', images, weightGrams: Number(p.productWeight || 0),
        market, warehouseCountry, variants: checked, available: available.length > 0,
        shippingNeedsQuote: warehouseCountry !== market,
        note: 'Stock is checked by variant ID in the source warehouse. Destination freight, import taxes and final retail pricing are not included.'
      },
      requestId: detailJson.requestId || null
    });
  } catch (_) {
    return res.status(500).json({ error: 'Unable to contact CJ product service right now.' });
  }
};
