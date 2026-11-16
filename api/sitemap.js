const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 8000 });
const esc = value => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
module.exports = async (req,res) => {
  res.setHeader("Content-Type","application/xml; charset=utf-8");
  res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=86400");
  const origin = "https://cartvanta-3kfx.vercel.app";
  try {
    const { rows } = await pool.query("SELECT id, updated_at FROM products WHERE status='published' AND stock > 0 ORDER BY updated_at DESC LIMIT 45000");
    const fixed = ["/","/categories.html","/about.html","/contact.html","/faq.html","/shipping.html","/refund.html","/privacy.html","/terms.html"];
    const urls = fixed.map(path => ({loc:origin+path,lastmod:null}));
    for (const p of rows) urls.push({loc:origin+"/product.html?id="+encodeURIComponent(p.id),lastmod:p.updated_at});
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>'<url><loc>'+esc(u.loc)+'</loc>'+(u.lastmod?'<lastmod>'+new Date(u.lastmod).toISOString().slice(0,10)+'</lastmod>':'')+'</url>').join("")+'</urlset>';
    res.statusCode=200; return res.end(body);
  } catch (error) {
    console.error("Sitemap generation failed",error);
    res.statusCode=503; return res.end('<?xml version="1.0"?><error>Sitemap temporarily unavailable</error>');
  }
};