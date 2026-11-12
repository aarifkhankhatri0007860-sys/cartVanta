module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'CJ_API_KEY is not configured in Vercel.' });

  try {
    const tokenResponse = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    const tokenJson = await tokenResponse.json().catch(() => ({}));
    const accessToken = tokenJson?.data?.accessToken;
    if (!tokenResponse.ok || !accessToken || tokenJson.code !== 200) {
      return res.status(502).json({ stage: 'authentication', error: 'CJ authentication failed', cjCode: tokenJson.code ?? null, cjMessage: tokenJson.message || null, requestId: tokenJson.requestId || null });
    }

    const market = String(req.query.market || 'US').toUpperCase() === 'CN' ? 'CN' : 'US';
    const keyword = String(req.query.keyword || '').trim().slice(0, 100);
    const params = new URLSearchParams({
      page: '1',
      size: '40',
      countryCode: market,
      startWarehouseInventory: '5',
      verifiedWarehouse: '1',
      productFlag: '0',
      sort: 'desc',
      orderBy: '4'
    });
    if (keyword) params.set('keyWord', keyword);

    const productResponse = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/listV2?' + params.toString(), {
      headers: { 'CJ-Access-Token': accessToken }
    });
    const productJson = await productResponse.json().catch(() => ({}));
    if (!productResponse.ok || productJson.code !== 200) {
      return res.status(502).json({ stage: 'product-search', error: 'CJ product search returned an error', cjCode: productJson.code ?? null, cjMessage: productJson.message || null, requestId: productJson.requestId || null });
    }

    const data = productJson.data || {};
    const content = Array.isArray(data.content) ? data.content : [];
    const raw = content.flatMap(group => Array.isArray(group.productList) ? group.productList : []);
    const blocked = /sexy|sex\b|lingerie|underwear|panty|panties|bra\b|bodysuit|thong|bondage|fetish|vibrator|adult|erotic|nipple|lubricat|weapon|knife|taser|cbd|hemp|medicine|medical|supplement|slimming|weight loss/i;
    const products = raw
      .filter(p => !blocked.test(String(p.nameEn || p.productNameEn || p.productName || '')))
      .map(p => ({
        id: p.id || p.pid || null,
        name: p.nameEn || p.productNameEn || p.productName || 'CJ Product',
        sku: p.sku || p.productSku || null,
        image: p.bigImage || p.productImage || p.image || null,
        price: p.nowPrice ?? p.sellPrice ?? p.productPrice ?? null,
        stock: p.totalVerifiedInventory ?? p.warehouseInventoryNum ?? p.totalInventoryNum ?? p.inventory ?? null,
        currency: 'USD',
        warehouse: market
      }))
      .filter(p => p.id && p.image && p.price !== null);

    return res.status(200).json({
      products, market, count: products.length,
      totalRecords: data.totalRecords ?? null,
      pageNumber: data.pageNumber ?? null,
      pageSize: data.pageSize ?? null,
      filters: { verifiedWarehouse: 1, minimumWarehouseInventory: 5, trending: true, restrictedNameFilter: true },
      cjMessage: productJson.message || 'Success',
      requestId: productJson.requestId || null
    });
  } catch (error) {
    return res.status(500).json({ stage: 'server', error: 'Unable to contact CJ supplier service right now.' });
  }
};
