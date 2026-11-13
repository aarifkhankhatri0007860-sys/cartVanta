module.exports = async (req, res) => {
  // Cache briefly to avoid spending CJ API points on every page refresh.
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'CJ_API_KEY is not configured in Vercel.' });

  try {
    const auth = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    const authJson = await auth.json().catch(() => ({}));
    const accessToken = authJson?.data?.accessToken;
    if (!auth.ok || !accessToken || authJson.code !== 200) {
      return res.status(502).json({
        stage: 'authentication',
        error: 'CJ authentication failed',
        cjCode: authJson.code ?? null,
        cjMessage: authJson.message || null,
        requestId: authJson.requestId || null
      });
    }

    const marketInput = String(req.query.market || 'US').toUpperCase();
    const market = /^[A-Z]{2}$/.test(marketInput) ? marketInput : 'US';
    const warehouseCountry = market === 'US' ? 'US' : 'CN';
    const categoryTerms = {
      home: 'home storage organizer',
      decor: 'home decor',
      travel: 'travel accessories',
      kitchen: 'kitchen tools',
      tech: 'smart accessories',
      fitness: 'fitness outdoor'
    };
    const requestedCategory = String(req.query.category || '').toLowerCase();
    const keyword = String(req.query.keyword || categoryTerms[requestedCategory] || '').trim().slice(0, 100);
    const page = Math.min(1000, Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1));
    const params = new URLSearchParams({
      page: String(page),
      size: '100',
      countryCode: warehouseCountry,
      features: 'enable_category,enable_video',
      startWarehouseInventory: '1',
      verifiedWarehouse: '1'
    });
    if (keyword) params.set('keyWord', keyword);
    const categoryId = String(req.query.categoryId || '').trim();
    if (/^[A-Z0-9_-]{1,200}$/i.test(categoryId)) params.set('categoryId', categoryId);
    const productFlag = String(req.query.flag || '');
    if (['0','1','2'].includes(productFlag)) params.set('productFlag', productFlag);
    params.set('orderBy', '4');
    params.set('sort', 'desc');

    const response = await fetch(
      'https://developers.cjdropshipping.com/api2.0/v1/product/listV2?' + params.toString(),
      { headers: { 'CJ-Access-Token': accessToken } }
    );
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.code !== 200) {
      return res.status(502).json({
        stage: 'product-search',
        error: 'CJ product search returned an error',
        cjCode: json.code ?? null,
        cjMessage: json.message || null,
        requestId: json.requestId || null
      });
    }

    const data = json.data || {};
    const groups = Array.isArray(data.content) ? data.content : [];
    const raw = groups.flatMap(group => Array.isArray(group.productList) ? group.productList : []);
    const blocked = /sexy|sex\b|lingerie|underwear|panty|panties|bra\b|bodysuit|thong|bondage|fetish|vibrator|adult|erotic|nipple|lubricat|weapon|knife|taser|cbd|hemp|medicine|medical|supplement|slimming|weight loss/i;

    const candidates = raw
      .filter(p => !blocked.test(String(p.nameEn || p.productNameEn || p.productName || '')))
      .filter(p => p.totalVerifiedInventory == null || Number(p.totalVerifiedInventory) > 0)
      .map(p => ({
        id: p.id || p.pid || null,
        name: p.nameEn || p.productNameEn || p.productName || 'CJ Product',
        sku: p.sku || p.productSku || null,
        image: p.bigImage || p.productImage || p.image || null,
        price: p.nowPrice ?? p.sellPrice ?? p.productPrice ?? null,
        listedVerifiedInventory: p.totalVerifiedInventory ?? null
      }))
      .filter(p => p.id && p.sku && p.image && p.price !== null)
      .slice(0, 24); // Verify a bounded batch per page; the storefront can request subsequent pages.

    const verified = [];
    for (let i = 0; i < candidates.length; i += 6) {
      const batch = candidates.slice(i, i + 6);
      const results = await Promise.all(batch.map(async p => {
        try {
          const stockUrl = 'https://developers.cjdropshipping.com/api2.0/v1/product/stock/queryBySku?' +
            new URLSearchParams({ sku: p.sku });
          const stockResponse = await fetch(stockUrl, { headers: { 'CJ-Access-Token': accessToken } });
          const stockJson = await stockResponse.json().catch(() => ({}));
          if (!stockResponse.ok || stockJson.code !== 200 || !Array.isArray(stockJson.data)) return null;

          const warehouse = stockJson.data.find(x => String(x.countryCode || '').toUpperCase() === warehouseCountry);
          const stock = Number(warehouse?.cjInventoryNum ?? 0);
          if (!warehouse || !Number.isFinite(stock) || stock <= 0) return null;

          return { ...p, stock, currency: 'USD', warehouse: warehouseCountry, destination: market, stockVerified: true, shippingNeedsQuote: warehouseCountry !== market };
        } catch (_) {
          return null;
        }
      }));
      verified.push(...results.filter(Boolean));
    }

    return res.status(200).json({
      products: verified,
      market,
      warehouseCountry,
      destinationShippingQuoteRequired: warehouseCountry !== market,
      category: requestedCategory || 'all',
      requestedKeyword: keyword,
      count: verified.length,
      hasMore: page * Number(data.pageSize || 100) < Number(data.totalRecords || 0),
      totalRecords: data.totalRecords ?? null,
      pageNumber: data.pageNumber ?? null,
      pageSize: data.pageSize ?? null,
      filters: {
        verifiedWarehouse: 1,
        minimumCJWarehouseInventory: 1,
        realtimeSkuInventoryChecked: true,
        restrictedNameFilter: true,
        maxStockChecksPerRequest: 24,
        apiPageSize: 100,
        candidateBatchSize: 24,
        note: 'Reads up to 100 catalogue records per page and verifies a bounded first batch of 24 product SPUs against the requested destination warehouse. Load more to scan further pages.',
        currentPage: page
      },
      cjMessage: json.message || 'Success',
      requestId: json.requestId || null
    });
  } catch (_) {
    return res.status(500).json({
      stage: 'server',
      error: 'Unable to contact CJ supplier service right now.'
    });
  }
};