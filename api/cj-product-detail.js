module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const id = String(req.query.id || '').trim();
  if (!id || id.length > 100) return res.status(400).json({ error: 'A valid CJ product ID is required.' });
  const marketInput = String(req.query.market || 'US').toUpperCase();
  const destination = /^[A-Z]{2}$/.test(marketInput) ? marketInput : 'US';
  const warehouseCountry = destination === 'US' ? 'US' : 'CN';
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'CJ_API_KEY is not configured in Vercel.' });
  try {
    const auth = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
    });
    const authJson = await auth.json().catch(() => ({}));
    const token = authJson && authJson.data && authJson.data.accessToken;
    if (!auth.ok || authJson.code !== 200 || !token) return res.status(502).json({ error: 'CJ authentication failed.', cjMessage: authJson.message || null });
    const headers = { 'CJ-Access-Token': token };
    const detailResponse = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/query?pid=' + encodeURIComponent(id) + '&countryCode=' + warehouseCountry, { headers });
    const detailJson = await detailResponse.json().catch(() => ({}));
    if (!detailResponse.ok || detailJson.code !== 200) return res.status(502).json({ error: 'CJ product detail lookup failed.', cjMessage: detailJson.message || null });
    const item = Array.isArray(detailJson.data) ? detailJson.data[0] : detailJson.data;
    if (!item) return res.status(404).json({ error: 'CJ did not return this product.' });
    const variantResponse = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/variant/query?pid=' + encodeURIComponent(id) + '&countryCode=' + warehouseCountry, { headers });
    const variantJson = await variantResponse.json().catch(() => ({}));
    const rawVariants = variantJson.code === 200 && Array.isArray(variantJson.data) ? variantJson.data : [];
    const variants = rawVariants.slice(0, 30).map(v => ({
      id: v.vid || v.id || null,
      name: [v.variantNameEn, v.variantKeyEn, v.variantValueEn].filter(Boolean).join(' · ') || v.variantSku || 'Variant',
      variantSku: v.variantSku || null,
      stock: Number(v.inventory ?? v.cjInventoryNum ?? v.totalInventory ?? 0),
      price: v.variantSellPrice ?? v.sellPrice ?? null
    }));
    const images = Array.isArray(item.productImageSet) ? item.productImageSet : [];
    const description = String(item.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1800);
    return res.status(200).json({
      id: item.pid || item.id || id,
      name: item.productNameEn || item.nameEn || 'CJ product',
      sku: item.productSku || item.sku || null,
      image: item.bigImage || item.productImage || null,
      images: images.slice(0, 8),
      descriptionText: description,
      weightGrams: item.productWeight ?? null,
      variants,
      destination,
      warehouseCountry,
      variantDataAvailable: rawVariants.length > 0,
      shippingQuoteRequired: true,
      note: 'Variant stock fields are supplier-reported. Recheck the chosen variant stock and destination freight immediately before accepting payment.'
    });
  } catch (_) {
    return res.status(500).json({ error: 'Unable to retrieve CJ product details right now.' });
  }
};