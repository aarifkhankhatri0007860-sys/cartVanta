import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const DB_DIR = process.env.DB_DIR || './data';
fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(path.join(DB_DIR, 'cartvanta.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(`
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, category_id TEXT, brand TEXT, cost REAL NOT NULL DEFAULT 0, price REAL NOT NULL, mrp REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, description TEXT DEFAULT '', tags TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS product_images(id TEXT PRIMARY KEY, product_id TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, order_number TEXT UNIQUE NOT NULL, customer_id TEXT, customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, address TEXT NOT NULL, items_json TEXT NOT NULL, subtotal REAL NOT NULL, shipping REAL NOT NULL DEFAULT 0, total REAL NOT NULL, payment_method TEXT NOT NULL DEFAULT 'cod', payment_status TEXT NOT NULL DEFAULT 'pending', status TEXT NOT NULL DEFAULT 'new', admin_remark TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
`);

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const safe = (v, max=500) => String(v ?? '').trim().slice(0,max);
const json = (v, fallback=[]) => { try { return JSON.parse(v || ''); } catch { return fallback; } };
const tokenSecret = process.env.JWT_SECRET;
if (!tokenSecret || tokenSecret.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters before starting the API.');
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const email = process.env.ADMIN_EMAIL.toLowerCase().trim();
  const found = db.prepare('SELECT id FROM admins WHERE email=?').get(email);
  if (!found) db.prepare('INSERT INTO admins(email,password_hash,role,created_at) VALUES(?,?,?,?)').run(email,bcrypt.hashSync(process.env.ADMIN_PASSWORD,12),'owner',now());
}
app.disable('x-powered-by');
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin:(process.env.ALLOWED_ORIGINS || '*').split(',').map(x=>x.trim()),credentials:false}));
app.use(express.json({limit:'1mb'}));
app.use('/api/auth', rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false}));
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:8},fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp','image/avif'].includes(file.mimetype))});
const auth = (req,res,next) => {
  try {
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer ') || !tokenSecret) return res.status(401).json({error:'Sign in required'});
    req.admin=jwt.verify(h.slice(7),tokenSecret);
    next();
  } catch { return res.status(401).json({error:'Session expired. Please sign in again.'}); }
};
const adminOnly=(req,res,next)=>auth(req,res,next);
const productRow = (r) => ({id:r.id,name:r.name,sku:r.sku,categoryId:r.category_id,categoryName:r.category_name||null,brand:r.brand,cost:r.cost,price:r.price,mrp:r.mrp,stock:r.stock,description:r.description,tags:json(r.tags),status:r.status,images:(r.image_ids||'').split(',').filter(Boolean).map(x=>`/api/images/${x}`),createdAt:r.created_at,updatedAt:r.updated_at});
const productSelect = `SELECT p.*,c.name category_name,(SELECT group_concat(id, ',') FROM product_images WHERE product_id=p.id) image_ids FROM products p LEFT JOIN categories c ON c.id=p.category_id`;

app.get('/health',(req,res)=>res.json({ok:true,service:'CartVanta API',database:'connected',time:now()}));
app.post('/api/auth/login',async(req,res)=>{
  const email=safe(req.body?.email,254).toLowerCase(), password=String(req.body?.password||'');
  const admin=db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  if(!admin || !await bcrypt.compare(password,admin.password_hash)) return res.status(401).json({error:'Invalid email or password'});
  const token=jwt.sign({id:admin.id,email:admin.email,role:admin.role},tokenSecret,{expiresIn:'12h'});
  res.json({token,admin:{email:admin.email,role:admin.role},expiresIn:43200});
});
app.get('/api/auth/me',adminOnly,(req,res)=>res.json({admin:req.admin}));
app.post('/api/auth/change-password',adminOnly,async(req,res)=>{
  const current=String(req.body?.currentPassword||''), next=String(req.body?.newPassword||'');
  if(next.length<12) return res.status(400).json({error:'New password must be at least 12 characters'});
  const row=db.prepare('SELECT password_hash FROM admins WHERE id=?').get(req.admin.id);
  if(!await bcrypt.compare(current,row.password_hash)) return res.status(400).json({error:'Current password is incorrect'});
  db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(await bcrypt.hash(next,12),req.admin.id);
  res.json({ok:true,message:'Password changed. Sign in again.'});
});

app.get('/api/categories',(req,res)=>{
  const rows=db.prepare('SELECT * FROM categories WHERE status=? ORDER BY name').all('active');
  res.json(rows);
});
app.get('/api/admin/categories',adminOnly,(req,res)=>res.json(db.prepare('SELECT * FROM categories ORDER BY name').all()));
app.post('/api/admin/categories',adminOnly,(req,res)=>{
  const name=safe(req.body?.name,80), status=req.body?.status==='hidden'?'hidden':'active';
  if(!name) return res.status(400).json({error:'Category name required'});
  const slug=name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+crypto.randomBytes(3).toString('hex');
  const row={id:id(),name,slug,status,created_at:now(),updated_at:now()};
  db.prepare('INSERT INTO categories VALUES(@id,@name,@slug,@status,@created_at,@updated_at)').run(row);
  res.status(201).json(row);
});
app.put('/api/admin/categories/:id',adminOnly,(req,res)=>{
  const name=safe(req.body?.name,80),status=req.body?.status==='hidden'?'hidden':'active';
  const result=db.prepare('UPDATE categories SET name=?,status=?,updated_at=? WHERE id=?').run(name,status,now(),req.params.id);
  if(!result.changes) return res.status(404).json({error:'Category not found'});
  res.json({ok:true});
});
app.delete('/api/admin/categories/:id',adminOnly,(req,res)=>{
  const result=db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  if(!result.changes) return res.status(404).json({error:'Category not found'});
  res.json({ok:true});
});

app.get('/api/products',(req,res)=>{
  const rows=db.prepare(productSelect+' WHERE p.status=? ORDER BY p.created_at DESC').all('published');
  res.json(rows.map(productRow));
});
app.get('/api/products/:id',(req,res)=>{
  const row=db.prepare(productSelect+' WHERE p.id=? AND p.status=?').get(req.params.id,'published');
  if(!row) return res.status(404).json({error:'Product not found'});
  res.json(productRow(row));
});
app.get('/api/admin/products',adminOnly,(req,res)=>res.json(db.prepare(productSelect+' ORDER BY p.created_at DESC').all().map(productRow)));
app.post('/api/admin/products',adminOnly,(req,res)=>{
  const b=req.body||{}, name=safe(b.name,160), sku=safe(b.sku,80)||('CV-'+crypto.randomBytes(4).toString('hex').toUpperCase()), price=Number(b.price), stock=Number(b.stock);
  if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0) return res.status(400).json({error:'Valid product name, price and whole-number stock are required'});
  const row={id:id(),name,sku,category_id:b.categoryId||null,brand:safe(b.brand,100),cost:Math.max(0,Number(b.cost)||0),price,mrp:Math.max(0,Number(b.mrp)||0),stock,description:safe(b.description,5000),tags:JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,30).map(x=>safe(x,40)):[]),status:b.status==='published'?'published':'draft',created_at:now(),updated_at:now()};
  try { db.prepare('INSERT INTO products VALUES(@id,@name,@sku,@category_id,@brand,@cost,@price,@mrp,@stock,@description,@tags,@status,@created_at,@updated_at)').run(row); }
  catch(e){return res.status(409).json({error:e.message.includes('UNIQUE')?'SKU already exists':'Could not save product'});}
  res.status(201).json(row);
});
app.put('/api/admin/products/:id',adminOnly,(req,res)=>{
  const b=req.body||{}, old=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if(!old) return res.status(404).json({error:'Product not found'});
  const name=safe(b.name,160),price=Number(b.price),stock=Number(b.stock);
  if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0) return res.status(400).json({error:'Valid product name, price and whole-number stock are required'});
  try {
    db.prepare(`UPDATE products SET name=?,sku=?,category_id=?,brand=?,cost=?,price=?,mrp=?,stock=?,description=?,tags=?,status=?,updated_at=? WHERE id=?`).run(name,safe(b.sku,80)||old.sku,b.categoryId||null,safe(b.brand,100),Math.max(0,Number(b.cost)||0),price,Math.max(0,Number(b.mrp)||0),stock,safe(b.description,5000),JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,30):[]),b.status==='published'?'published':'draft',now(),req.params.id);
  } catch(e){return res.status(409).json({error:e.message.includes('UNIQUE')?'SKU already exists':'Could not update product'});}
  res.json({ok:true});
});
app.delete('/api/admin/products/:id',adminOnly,(req,res)=>{
  const result=db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  if(!result.changes) return res.status(404).json({error:'Product not found'});
  res.json({ok:true});
});
app.post('/api/admin/products/:id/images',adminOnly,upload.array('images',8),(req,res)=>{
  if(!req.files?.length) return res.status(400).json({error:'Select at least one supported image'});
  if(!db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id)) return res.status(404).json({error:'Product not found'});
  const insert=db.prepare('INSERT INTO product_images(id,product_id,mime,data,created_at) VALUES(?,?,?,?,?)');
  const tx=db.transaction(files=>files.forEach(f=>insert.run(id(),req.params.id,f.mimetype,f.buffer,now())));
  tx(req.files);
  res.status(201).json({ok:true,uploaded:req.files.length});
});
app.get('/api/images/:id',(req,res)=>{
  const row=db.prepare('SELECT mime,data FROM product_images WHERE id=?').get(req.params.id);
  if(!row) return res.status(404).end();
  res.set({'Content-Type':row.mime,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});
  res.send(row.data);
});
app.delete('/api/admin/images/:id',adminOnly,(req,res)=>{
  const result=db.prepare('DELETE FROM product_images WHERE id=?').run(req.params.id);
  res.json({ok:!!result.changes});
});

app.post('/api/orders', (req,res)=>{
  const b=req.body||{}, name=safe(b.customerName,120), phone=safe(b.phone,20).replace(/[^0-9+]/g,''), address=safe(b.address,1000);
  const items=Array.isArray(b.items)?b.items.slice(0,30):[];
  if(name.length<2||phone.replace(/\D/g,'').length<10||address.length<8||!items.length) return res.status(400).json({error:'Name, valid phone, delivery address and cart items are required'});
  const get=db.prepare('SELECT id,name,sku,price,stock,status FROM products WHERE id=?');
  const reduce=db.prepare('UPDATE products SET stock=stock-?,updated_at=? WHERE id=? AND stock>=?');
  const insertOrder=db.prepare('INSERT INTO orders(id,order_number,customer_id,customer_name,phone,email,address,items_json,subtotal,shipping,total,payment_method,payment_status,status,admin_remark,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const upsertCustomer=db.prepare('SELECT id FROM customers WHERE phone=?');
  const newCustomer=db.prepare('INSERT INTO customers(id,name,email,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)');
  const tx=db.transaction(()=>{
    let subtotal=0,clean=[];
    for(const item of items){
      const p=get.get(safe(item.productId,80)), qty=Number(item.quantity);
      if(!p||p.status!=='published'||!Number.isInteger(qty)||qty<1||qty>20||p.stock<qty) throw new Error('A cart item is unavailable or has insufficient stock');
      subtotal+=p.price*qty; clean.push({productId:p.id,name:p.name,sku:p.sku,price:p.price,quantity:qty});
    }
    const shipping=Math.max(0,Number(process.env.FLAT_SHIPPING||0)), total=subtotal+shipping;
    const paymentMethod=b.paymentMethod==='online'?'online':'cod';
    if(paymentMethod==='online') throw new Error('Online payment is not enabled yet. Choose COD or contact support.');
    for(const item of clean){const r=reduce.run(item.quantity,now(),item.productId,item.quantity);if(!r.changes) throw new Error('Stock changed. Please refresh your cart.');}
    let customer=upsertCustomer.get(phone), customerId=customer?.id||id();
    if(!customer) newCustomer.run(customerId,name,safe(b.email,254),phone,now(),now());
    const orderId=id(), orderNumber='CV'+Date.now().toString().slice(-9);
    insertOrder.run(orderId,orderNumber,customerId,name,phone,safe(b.email,254),address,JSON.stringify(clean),subtotal,shipping,total,'cod','pending','new','',now(),now());
    return {orderId,orderNumber,total};
  });
  try { res.status(201).json(tx()); } catch(e){res.status(400).json({error:e.message||'Order could not be created'});}
});

app.get('/api/admin/orders',adminOnly,(req,res)=>{
  const rows=db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000').all();
  res.json(rows.map(r=>({...r,items:json(r.items_json)})));
});
app.patch('/api/admin/orders/:id',adminOnly,(req,res)=>{
  const status=['new','confirmed','processing','packed','shipped','delivered','cancelled','returned'].includes(req.body?.status)?req.body.status:null;
  const payment=['pending','paid','failed','refunded','cod_due'].includes(req.body?.paymentStatus)?req.body.paymentStatus:null;
  const remark=safe(req.body?.adminRemark,2000);
  const row=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if(!row) return res.status(404).json({error:'Order not found'});
  if(status==='cancelled'&&row.status!=='cancelled'){
    const items=json(row.items_json,[]);
    const tx=db.transaction(()=>{for(const i of items) db.prepare('UPDATE products SET stock=stock+?,updated_at=? WHERE id=?').run(i.quantity,now(),i.productId);db.prepare('UPDATE orders SET status=?,payment_status=COALESCE(?,payment_status),admin_remark=?,updated_at=? WHERE id=?').run(status,payment,remark,now(),req.params.id);});
    tx();
  } else db.prepare('UPDATE orders SET status=COALESCE(?,status),payment_status=COALESCE(?,payment_status),admin_remark=?,updated_at=? WHERE id=?').run(status,payment,remark,now(),req.params.id);
  res.json({ok:true});
});
app.get('/api/admin/customers',adminOnly,(req,res)=>res.json(db.prepare(`SELECT c.*,COUNT(o.id) order_count,COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.total ELSE 0 END),0) paid_total FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`).all()));
app.get('/api/admin/dashboard',adminOnly,(req,res)=>{
  const products=db.prepare('SELECT COUNT(*) count,COALESCE(SUM(stock),0) units FROM products').get();
  const orders=db.prepare('SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN payment_status=\'paid\' THEN total ELSE 0 END),0) revenue FROM orders').get();
  const lowStock=db.prepare('SELECT id,name,sku,stock FROM products WHERE stock<=5 ORDER BY stock LIMIT 20').all();
  const recent=db.prepare('SELECT id,order_number,customer_name,total,payment_status,status,created_at FROM orders ORDER BY created_at DESC LIMIT 8').all();
  res.json({products,orders,lowStock,recent});
});
app.get('/api/admin/backup',adminOnly,async(req,res)=>{
  const backupPath=path.join(DB_DIR,`backup-${crypto.randomUUID()}.db`);
  try {
    await db.backup(backupPath);
    const data=fs.readFileSync(backupPath);
    res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="cartvanta-backup-${new Date().toISOString().slice(0,10)}.db"`});
    res.send(data);
  } catch(e) { res.status(500).json({error:'Database backup failed'}); }
  finally { try { if(fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch {} }
});
app.use((err,req,res,next)=>{
  console.error(err);
  if(err instanceof multer.MulterError) return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'Each image must be 5 MB or smaller':'Image upload limit exceeded'});
  res.status(500).json({error:'Internal server error'});
});
app.listen(PORT,'0.0.0.0',()=>console.log(`CartVanta API listening on ${PORT}; database: ${path.join(DB_DIR,'cartvanta.db')}`));
