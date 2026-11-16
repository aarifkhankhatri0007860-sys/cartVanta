# CartVanta

Direct-inventory online store powered by a Firebase-free Node.js + SQLite API.

## Architecture
- Storefront: static HTML/CSS/JavaScript on Vercel.
- Backend: Express API in `database-server/`.
- Database: one persistent SQLite file, `cartvanta.db`.
- Product images: BLOBs stored inside the same database.
- Admin: `/admin.html`, private token-authenticated API.
- Checkout: COD order creation only.

## Deploy
Follow [ADMIN-SETUP.md](./ADMIN-SETUP.md) for Render API deployment, persistent disk, admin credentials and Vercel API URL configuration.

## Features
- Published catalogue, product details and active categories.
- Admin dashboard, login, product/category management, image upload, inventory, orders CRM, customer list and database backup.
- COD order API recalculates prices from the database, validates stock and saves orders transactionally.

## Not yet enabled
Razorpay online payment, courier integration, customer OTP tracking, WhatsApp automation, marketplace sync and Meta Purchase events.

## Security
Never commit environment files, database files, backups, passwords or signing secrets. Use HTTPS, strong secrets, exact CORS origins, persistent disk and off-platform backups. SQLite on persistent disk must run as one API instance.
