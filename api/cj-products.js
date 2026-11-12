module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'CJ_API_KEY is not configured in Vercel.' });
  try {
    const auth = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
    });
    const authJson = await auth.json().catch(() => ({}));
    const accessToken = authJson?.data?.accessToken;
    if (!auth.ok || !accessToken || authJson.code !== 200) {
      return res.status(502).json({ stage: 'authentication', error: 'CJ authentication failed', cjCode: authJson.code ?? null, cjMessage: authJson.message || null, requestId: authJson.requestId || null });
    }
    const market = String(req.query.market || 'US').toUpperCase() === 'CN' ? 'CN' : 'US';
    const keyword = String(req.query.keyword || '').trim().slice(0, 100);
    const params = new URLSearchParams({ page: '1', size: '20', countryCode: market, startWarehouseInventory: '1', verifiedWarehouse: '1', productFlag: '0' });
    if (keyword) params.set('keyWord', keyword);
    const response = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/listV2?' + params.toString(), {
      headers: { 'CJ-Access-Token': accessToken }
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.code !== 200) {
      return res.status(502).json({ stage: 'product-search', error: 'CJ product search returned an error', cjCode: json.code ?? null, cjMessage: json.message || null, requestId: json.requestId || null });
    }
    const data = json.data || {};
    const groups = Array.isArray(data.content) ? data.content : [];
    const raw = groups.flatMap(group => Array.isArray(group.productList) ? group.productList : []);
    const blocked = /sexy|sex\\b|lingerie|underwear|panty|panties|bra\\b|bodysuit|thong|bondage|fetish|vibrator|adult|erotic|nipple|lubricat|weapon|knife|taser|cbd|hemp|medicine|medical|supplement|slimming|weight loss/i;
    const candidates = raw.filter(p => !blocked.test(String(p.nameEn || p.productNameEn || p.productName || '')))
      .map(p => ({
        id: p.id || p.pid || null,
        name: p.nameEn || p.productNameEn || p.productName || 'CJ Product',
        sku: p.sku || p.productSku || null,
        image: p.bigImage || p.productImage || p.image || null,
        price: p.nowPrice ?? p.sellPrice ?? p.productPrice ?? null
      })).filter(p => p.id && p.sku && p.image && p.price !== null);

    // Verify real CJ warehouse stock per SKU; never trust a missing list-level stock field.
    const verified = [];
    for (let i = 0; i < candidates.length; i += 4) {
      const batch = candidates.slice(i, i + 4);
      const results = await Promise.all(batch.map(async p => {
        try {
          const stockUrl = 'https://developers.cjdropshipping.com/api2.0/v1/product/stock/queryBySku?' + new URLSearchParams({ sku: p.sku });
          const stockResponse = await fetch(stockUrl, { headers: { 'CJ-Access-Token': accessToken } });
          const stockJson = await stockResponse.json().catch(() => ({}));
          if (!stockResponse.ok || stockJson.code !== 200 || !Array.isArray(stockJson.data)) return null;
          const wh = stockJson.data.find(x => String(x.countryCode || '').toUpperCase() === market);
          const stock = Number(wh?.cjInventoryNum ?? 0);
          if (!wh || !Number.isFinite(stock) || stock <= 0) return null;
          return { ...p, stock, currency: 'USD', warehouse: market, stockVerified: true };
        } catch (_) { return null; }
      }));
      verified.push(...results.filter(Boolean));
    }
    return res.status(200).json({
      products: verified, market, count: verified.length,
      totalRecords: data.totalRecords ?? null, pageNumber: data.pageNumber ?? null, pageSize: data.pageSize ?? null,
      filters: { verifiedWarehouse: 1, minimumCJWarehouseInventory: 1, trending: true, realtimeSkuInventoryChecked: true, restrictedNameFilter: true },
      cjMessage: json.message || 'Success', requestId: json.requestId || null
    });
  } catch (_) {
    return res.status(500).json({ stage: 'server', error: 'Unable to contact CJ supplier service right now.' });
  }
};
