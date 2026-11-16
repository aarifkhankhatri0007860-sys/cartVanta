import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { put, del } from "@vercel/blob";
import Busboy from "busboy";
import { randomUUID } from "node:crypto";

const pool = globalThis.__cartvantaPool || new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
});
globalThis.__cartvantaPool = pool;

const secret = process.env.JWT_SECRET;
const now = () => new Date().toISOString();
const str = (v, n=500) => String(v ?? "").trim().slice(0,n);
const json = (v, fallback=[]) => { try { return typeof v === "string" ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; } };
const money = v => Number(v || 0);
const send = (res, status, data) => res.status(status).json(data);
const fail = (res, status, message) => send(res,status,{error:message});

async function schema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins(id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS products(id UUID PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, category_id UUID REFERENCES categories(id) ON DELETE SET NULL, brand TEXT DEFAULT '', cost NUMERIC(12,2) NOT NULL DEFAULT 0, price NUMERIC(12,2) NOT NULL, mrp NUMERIC(12,2) NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, description TEXT DEFAULT '', tags JSONB NOT NULL DEFAULT '[]'::jsonb, images JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS customers(id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS orders(id UUID PRIMARY KEY, order_number TEXT UNIQUE NOT NULL, customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, address TEXT NOT NULL, items_json JSONB NOT NULL, subtotal NUMERIC(12,2) NOT NULL, shipping NUMERIC(12,2) NOT NULL DEFAULT 0, total NUMERIC(12,2) NOT NULL, payment_method TEXT NOT NULL DEFAULT 'cod', payment_status TEXT NOT NULL DEFAULT 'pending', status TEXT NOT NULL DEFAULT 'new', admin_remark TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS idx_cv_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_cv_orders_created ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cv_orders_phone ON orders(phone);
  `);
  const email = str(process.env.ADMIN_EMAIL,254).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (email && password) {
    const exists = await pool.query("SELECT id FROM admins WHERE email=$1",[email]);
    if (!exists.rowCount) await pool.query("INSERT INTO admins(id,email,password_hash,role) VALUES($1,$2,$3,'owner')",[randomUUID(),email,await bcrypt.hash(password,12)]);
  }
}

async function auth(req) {
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET is not configured correctly");
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) throw new Error("Sign in required");
  return jwt.verify(h.slice(7),secret);
}

async function readMultipart(req) {
  return new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{fileSize:5*1024*1024,files:8}});
    const files=[];
    bb.on("file",(name,file,info)=>{
      const chunks=[]; let size=0;
      file.on("data",d=>{size+=d.length;chunks.push(d)});
      file.on("limit",()=>reject(new Error("Each image must be 5 MB or smaller")));
      file.on("end",()=>{if(size && ["image/jpeg","image/png","image/webp","image/avif"].includes(info.mimeType)) files.push({buffer:Buffer.concat(chunks),type:info.mimeType,filename:info.filename})});
    });
    bb.on("error",reject); bb.on("finish",()=>resolve(files)); req.pipe(bb);
  });
}

export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if (!process.env.DATABASE_URL) return fail(res,503,"DATABASE_URL is missing in Vercel environment variables.");
  if (!process.env.PRODUCT_IMAGES_READ_WRITE_TOKEN) return fail(res,503,"Product image storage is not configured. Check PRODUCT_IMAGES_READ_WRITE_TOKEN.");
  try {
    await schema();
    const route = "/" + String(req.query?.path || "").replace(/^\/+|\/+$/g,"");
    const method=req.method || "GET";

    if(route==="/health" && method==="GET") return send(res,200,{ok:true,service:"CartVanta Vercel API",database:"connected",time:now()});

    if(route==="/auth/login" && method==="POST"){
      const email=str(req.body?.email,254).toLowerCase(), password=String(req.body?.password||"");
      const q=await pool.query("SELECT * FROM admins WHERE email=$1",[email]);
      if(!q.rowCount || !await bcrypt.compare(password,q.rows[0].password_hash)) return fail(res,401,"Invalid email or password");
      const admin=q.rows[0], token=jwt.sign({id:admin.id,email:admin.email,role:admin.role},secret,{expiresIn:"12h"});
      return send(res,200,{token,admin:{email:admin.email,role:admin.role},expiresIn:43200});
    }
    if(route==="/auth/me" && method==="GET"){const a=await auth(req);return send(res,200,{admin:a});}

    if(route==="/categories" && method==="GET"){
      const q=await pool.query("SELECT * FROM categories WHERE status='active' ORDER BY name");
      return send(res,200,q.rows);
    }

    if(route==="/products" && method==="GET"){
      const q=await pool.query("SELECT p.*,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='published' ORDER BY p.created_at DESC");
      return send(res,200,q.rows.map(productRow));
    }
    const productMatch=route.match(/^\/products\/([a-f0-9-]+)$/i);
    if(productMatch && method==="GET"){
      const q=await pool.query("SELECT p.*,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=$1 AND p.status='published'",[productMatch[1]]);
      if(!q.rowCount)return fail(res,404,"Product not found");
      return send(res,200,productRow(q.rows[0]));
    }

    const admin=await auth(req);
    if(route==="/admin/dashboard" && method==="GET"){
      const [p,o,l,r]=await Promise.all([
        pool.query("SELECT COUNT(*)::int count,COALESCE(SUM(stock),0)::int units FROM products"),
        pool.query("SELECT COUNT(*)::int count,COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0)::numeric revenue FROM orders"),
        pool.query("SELECT id,name,sku,stock FROM products WHERE stock<=5 ORDER BY stock LIMIT 20"),
        pool.query("SELECT id,order_number,customer_name,total,payment_status,status,created_at FROM orders ORDER BY created_at DESC LIMIT 8")
      ]);
      return send(res,200,{products:p.rows[0],orders:o.rows[0],lowStock:l.rows,recent:r.rows});
    }
    if(route==="/admin/products" && method==="GET"){
      const q=await pool.query("SELECT p.*,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC");
      return send(res,200,q.rows.map(productRow));
    }
    if(route==="/admin/products" && method==="POST"){
      const b=req.body||{},name=str(b.name,160),sku=str(b.sku,80)||("CV-"+randomUUID().slice(0,8).toUpperCase()),price=Number(b.price),stock=Number(b.stock);
      if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0)return fail(res,400,"Valid product name, price and whole-number stock are required");
      const id=randomUUID();
      try{
        const q=await pool.query("INSERT INTO products(id,name,sku,category_id,brand,cost,price,mrp,stock,description,tags,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
        [id,name,sku,b.categoryId||null,str(b.brand,100),Math.max(0,money(b.cost)),price,Math.max(0,money(b.mrp)),stock,str(b.description,5000),JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,30):[]),b.status==="published"?"published":"draft"]);
        return send(res,201,productRow(q.rows[0]));
      }catch(e){if(e.code==="23505")return fail(res,409,"SKU already exists");throw e}
    }
    const adminProduct=route.match(/^\/admin\/products\/([a-f0-9-]+)$/i);
    if(adminProduct && method==="PUT"){
      const b=req.body||{},id=adminProduct[1],name=str(b.name,160),price=Number(b.price),stock=Number(b.stock);
      if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0)return fail(res,400,"Valid product name, price and whole-number stock are required");
      const q=await pool.query("UPDATE products SET name=$2,sku=COALESCE(NULLIF($3,''),sku),category_id=$4,brand=$5,cost=$6,price=$7,mrp=$8,stock=$9,description=$10,tags=$11,status=$12,updated_at=NOW() WHERE id=$1 RETURNING *",
      [id,name,str(b.sku,80),b.categoryId||null,str(b.brand,100),Math.max(0,money(b.cost)),price,Math.max(0,money(b.mrp)),stock,str(b.description,5000),JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,30):[]),b.status==="published"?"published":"draft"]);
      if(!q.rowCount)return fail(res,404,"Product not found");
      return send(res,200,productRow(q.rows[0]));
    }
    if(adminProduct && method==="DELETE"){
      const q=await pool.query("DELETE FROM products WHERE id=$1 RETURNING id",[adminProduct[1]]);
      if(!q.rowCount)return fail(res,404,"Product not found");
      return send(res,200,{ok:true});
    }
    const imagesMatch=route.match(/^\/admin\/products\/([a-f0-9-]+)\/images$/i);
    if(imagesMatch && method==="POST"){
      const productId=imagesMatch[1],exists=await pool.query("SELECT id FROM products WHERE id=$1",[productId]);
      if(!exists.rowCount)return fail(res,404,"Product not found");
      const files=await readMultipart(req);if(!files.length)return fail(res,400,"Select supported product images");
      const urls=[];
      for(const f of files){const blob=await put("products/"+productId+"/"+randomUUID(),f.buffer,{access:"public",contentType:f.type,addRandomSuffix:false,token:process.env.PRODUCT_IMAGES_READ_WRITE_TOKEN});urls.push(blob.url)}
      const q=await pool.query("UPDATE products SET images=images || $2::jsonb,updated_at=NOW() WHERE id=$1 RETURNING *",[productId,JSON.stringify(urls)]);
      return send(res,201,{ok:true,uploaded:urls.length,product:productRow(q.rows[0])});
    }

    if(route==="/admin/categories" && method==="GET"){
      const q=await pool.query("SELECT * FROM categories ORDER BY name");return send(res,200,q.rows);
    }
    if(route==="/admin/categories" && method==="POST"){
      const name=str(req.body?.name,80);if(!name)return fail(res,400,"Category name required");
      const slug=name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+randomUUID().slice(0,6);
      const q=await pool.query("INSERT INTO categories(id,name,slug,status) VALUES($1,$2,$3,'active') RETURNING *",[randomUUID(),name,slug]);
      return send(res,201,q.rows[0]);
    }
    const categoryMatch=route.match(/^\/admin\/categories\/([a-f0-9-]+)$/i);
    if(categoryMatch && method==="PUT"){
      const q=await pool.query("UPDATE categories SET name=$2,status=$3,updated_at=NOW() WHERE id=$1 RETURNING *",[categoryMatch[1],str(req.body?.name,80),req.body?.status==="hidden"?"hidden":"active"]);
      if(!q.rowCount)return fail(res,404,"Category not found");return send(res,200,q.rows[0]);
    }
    if(categoryMatch && method==="DELETE"){
      const q=await pool.query("DELETE FROM categories WHERE id=$1 RETURNING id",[categoryMatch[1]]);
      if(!q.rowCount)return fail(res,404,"Category not found");return send(res,200,{ok:true});
    }

    if(route==="/admin/orders" && method==="GET"){
      const q=await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000");
      return send(res,200,q.rows.map(o=>({...o,items:json(o.items_json)})));
    }
    const orderMatch=route.match(/^\/admin\/orders\/([a-f0-9-]+)$/i);
    if(orderMatch && method==="PATCH"){
      const status=["new","confirmed","processing","packed","shipped","delivered","cancelled","returned"].includes(req.body?.status)?req.body.status:null;
      const payment=["pending","paid","failed","refunded","cod_due"].includes(req.body?.paymentStatus)?req.body.paymentStatus:null;
      const q=await pool.query("UPDATE orders SET status=COALESCE($2,status),payment_status=COALESCE($3,payment_status),admin_remark=$4,updated_at=NOW() WHERE id=$1 RETURNING id",[orderMatch[1],status,payment,str(req.body?.adminRemark,2000)]);
      if(!q.rowCount)return fail(res,404,"Order not found");return send(res,200,{ok:true});
    }
    if(route==="/admin/customers" && method==="GET"){
      const q=await pool.query("SELECT c.*,COUNT(o.id)::int order_count,COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.total ELSE 0 END),0)::numeric paid_total FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.created_at DESC");
      return send(res,200,q.rows);
    }

    if(route==="/orders" && method==="POST"){
      const b=req.body||{},name=str(b.customerName,120),phone=str(b.phone,20).replace(/[^0-9+]/g,""),address=str(b.address,1000),items=Array.isArray(b.items)?b.items.slice(0,30):[];
      if(name.length<2||phone.replace(/\D/g,"").length<10||address.length<8||!items.length)return fail(res,400,"Name, valid phone, delivery address and cart items are required");
      if(b.paymentMethod==="online")return fail(res,400,"Online payment is not enabled yet. Choose COD.");
      const client=await pool.connect();
      try{
        await client.query("BEGIN");let subtotal=0;const clean=[];
        for(const item of items){
          const q=await client.query("SELECT id,name,sku,price,stock,status FROM products WHERE id=$1 FOR UPDATE",[str(item.productId,80)]);
          const p=q.rows[0],qty=Number(item.quantity);
          if(!p||p.status!=="published"||!Number.isInteger(qty)||qty<1||qty>20||p.stock<qty)throw new Error("A cart item is unavailable or has insufficient stock");
          subtotal+=Number(p.price)*qty;clean.push({productId:p.id,name:p.name,sku:p.sku,price:Number(p.price),quantity:qty});
          await client.query("UPDATE products SET stock=stock-$2,updated_at=NOW() WHERE id=$1",[p.id,qty]);
        }
        const existing=await client.query("SELECT id FROM customers WHERE phone=$1",[phone]);
        const customerId=existing.rows[0]?.id||randomUUID();
        if(existing.rowCount)await client.query("UPDATE customers SET name=$2,email=$3,updated_at=NOW() WHERE id=$1",[customerId,name,str(b.email,254)]);
        else await client.query("INSERT INTO customers(id,name,email,phone) VALUES($1,$2,$3,$4)",[customerId,name,str(b.email,254),phone]);
        const shipping=Math.max(0,Number(process.env.FLAT_SHIPPING||0)),total=subtotal+shipping,orderNumber="CV"+Date.now().toString().slice(-9),orderId=randomUUID();
        await client.query("INSERT INTO orders(id,order_number,customer_id,customer_name,phone,email,address,items_json,subtotal,shipping,total,payment_method,payment_status,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'cod','pending','new')",[orderId,orderNumber,customerId,name,phone,str(b.email,254),address,JSON.stringify(clean),subtotal,shipping,total]);
        await client.query("COMMIT");return send(res,201,{orderId,orderNumber,total});
      }catch(e){await client.query("ROLLBACK");return fail(res,400,e.message||"Order could not be created")}
      finally{client.release()}
    }

    return fail(res,404,"CartVanta API route not found");
  } catch(e) {
    console.error("CartVanta API error:",e);
    if(e.name==="JsonWebTokenError"||e.name==="TokenExpiredError"||e.message==="Sign in required")return fail(res,401,"Session expired. Please sign in again.");
    return fail(res,500,e.message||"Internal server error");
  }
}

function productRow(r){
  return {id:r.id,name:r.name,sku:r.sku,categoryId:r.category_id,categoryName:r.category_name||null,brand:r.brand,cost:Number(r.cost||0),price:Number(r.price||0),mrp:Number(r.mrp||0),stock:Number(r.stock||0),description:r.description,tags:json(r.tags),images:json(r.images),status:r.status,createdAt:r.created_at,updatedAt:r.updated_at};
}
