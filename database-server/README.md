# CartVanta Own Database API (Firebase-free)

Node.js + SQLite API. The complete database is one file: `cartvanta.db`. Product image bytes are stored in SQLite BLOBs in the same file.

## Deploy
1. Create a Render Web Service from this repository.
2. Root Directory: `database-server`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add a persistent disk mounted at `/var/data` (paid web service required).
6. Add environment variables from `.env.example`; use a strong random JWT_SECRET and a unique ADMIN_PASSWORD.
7. Set ALLOWED_ORIGINS to the exact CartVanta website origin.
8. Deploy and verify `https://YOUR-API/health`.

Do not run with a free ephemeral filesystem for real orders: data may be lost on restart or redeploy. Never commit .env, database files, or backups to GitHub.

## API
Public: GET /health, GET /api/categories, GET /api/products, GET /api/products/:id, GET /api/images/:id, POST /api/orders.
Admin: POST /api/auth/login; then send Authorization: Bearer TOKEN for /api/auth/me, /api/admin/dashboard, /api/admin/products, /api/admin/categories, /api/admin/orders, /api/admin/customers, /api/admin/backup.

## First admin
On first start, the server creates ADMIN_EMAIL using ADMIN_PASSWORD if that email does not already exist. Change the password immediately after first login. Do not expose the admin credentials in frontend code.

## Important limitations
- COD order creation is enabled. Online payment is deliberately disabled until a complete Razorpay server-side create/verify/webhook flow is implemented and tested.
- No courier API or OTP customer tracking is connected yet.
- SQLite is suitable for a small single-instance store. A persistent-disk SQLite deployment must remain a single API instance; do not horizontally scale it. Take and test backups regularly.
- Uploaded images are stored in the database and increase the database file size. Resize/compress images before upload.
- This service is a starting backend; connect and test every storefront/Admin screen before taking live orders.
