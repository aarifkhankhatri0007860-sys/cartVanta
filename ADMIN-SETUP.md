# CartVanta — Firebase-free database deployment

CartVanta uses its own Node.js + SQLite API. Product/order/customer data and uploaded product photos are stored in one SQLite file named `cartvanta.db`.

## A. Deploy the API on Render
1. Render → New → Web Service.
2. Connect `aarifkhankhatri0007860-sys/cartVanta`.
3. Root Directory: `database-server`.
4. Build: `npm install`; Start: `npm start`.
5. Choose a paid web service plan with persistent-disk support.
6. Add a persistent disk mounted at `/var/data`, starting with 1 GB.
7. Set private environment variables:
   - `DB_DIR=/var/data`
   - `JWT_SECRET` = random secret, minimum 32 characters
   - `ADMIN_EMAIL` = your private admin email
   - `ADMIN_PASSWORD` = unique password, minimum 16 characters
   - `ALLOWED_ORIGINS` = exact CartVanta website origin
   - `FLAT_SHIPPING=0` until shipping rules are configured
8. Deploy. Open `https://YOUR-API.onrender.com/health`; expect `ok:true`.
9. First boot creates the admin user from ADMIN_EMAIL and ADMIN_PASSWORD. Keep them private.

## B. Connect website
1. Open `database-config.js` in GitHub.
2. Replace `https://YOUR-CARTVANTA-API.onrender.com` with the exact Render API URL (no trailing slash).
3. Commit; Vercel redeploys.
4. Open `/admin.html` and sign in.
5. Add categories, products, prices, stock and photos. Publish products to show them.

## C. Verify before launch
- Test API health and admin login.
- Add one test category and product with photo.
- Verify it appears on homepage and product page.
- Place a COD test order using your own test contact details.
- Verify order in Admin → Orders & CRM and stock deduction.
- Download a database backup and keep it outside GitHub.
- Delete test data before launch.

## D. Boundaries and security
- Firebase is not used by the new storefront, product details, categories, cart checkout or Admin Panel.
- Only COD is enabled. Razorpay needs secure server-side order creation, signature verification and webhook reconciliation before activation.
- Courier tracking, OTP tracking, WhatsApp automation and marketplace sync are not connected.
- Never commit .env, database files, backups, passwords or JWT secrets.
- Product photos are BLOBs inside SQLite; compress before upload.
- SQLite on a persistent disk is single-instance only. Do not horizontally scale this API. Keep regular off-platform backups.
- Render free web services have ephemeral filesystems; they are not suitable for this SQLite file. Persistent disks require a paid web service. Check current Render pricing before deployment.
