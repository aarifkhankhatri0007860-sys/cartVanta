module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'CJ API key is not configured in Vercel yet.' });

  try {
    const tokenResponse = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    const tokenJson = await tokenResponse.json();
    const accessToken = tokenJson && tokenJson.data && tokenJson.data.accessToken;
    if (!tokenResponse.ok || !accessToken || (tokenJson.code && tokenJson.code !== 200 && tokenJson.code !== 0)) {
      return res.status(502).json({ error: 'CJ authentication failed. Check API key and store authorization in CJ.' });
    }

    const market = String(req.query.market || 'US').toUpperCase();
    const countryCode = market === 'US' ? 'US' : 'CN';
    const keyword = String(req.query.keyword || '').slice(0, 100);
    const params = new URLSearchParams({ page: '1', size: '24', countryCode, verifiedWarehouse: '1', sort: 'desc', orderBy: '0' });
    if (keyword) params.set('keyWord', keyword);

    const productResponse = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/listV2?' + params.toString(), {
      headers: { 'CJ-Access-Token': accessToken }
    });
    const productJson = await productResponse.json();
    if (!productResponse.ok || (productJson.code && productJson.code !== 200 && productJson.code !== 0)) {
      return res.status(502).json({ error: 'CJ product search failed. Please retry later.' });
    }

    const content = productJson.data && Array.isArray(productJson.data.content) ? productJson.data.content : [];
    const raw = content.flatMap(group => Array.isArray(group.productList) ? group.productList : []);
    const products = raw.map(p => ({
      id: p.id,
      name: p.nameEn,
      sku: p.sku,
      image: p.bigImage,
      price: p.nowPrice || p.sellPrice,
      stock: p.totalVerifiedInventory ?? p.warehouseInventoryNum,
      currency: 'USD'
    }));
    return res.status(200).json({ products, market: countryCode, count: products.length });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to contact CJ supplier service right now.' });
  }
};