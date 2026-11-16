# CartVanta

CartVanta is a directly stocked online store. Product catalogue, categories and product images are managed through the CartVanta Admin Panel using a dedicated Firebase project.

## Deployment
- Import this GitHub repository into Vercel.
- Framework preset: Other.
- Build command: leave blank.
- Output directory: root.
- Configure the new CartVanta Firebase Web App in `firebase-config.js`.
- Deploy the Firestore and Storage security rules from `firestore.rules` and `storage.rules`.
- See [ADMIN-SETUP.md](./ADMIN-SETUP.md) for the complete setup steps.

## Admin Panel
- Open `/admin.html`.
- Sign in with the admin user created in Firebase Authentication.
- Add categories, products, stock, prices, descriptions and actual product photos.
- Set a product to Published to make it visible in the storefront.
- Manage order status and internal remarks in Orders & CRM.

## Current implementation boundaries
The Admin Panel, product/category management, Firebase Storage photo upload, dashboard and CRM views are implemented in the repository. A new Firebase project, Web App config, admin UID and published security rules are still required before the panel can connect to live data.

Customer checkout, live Razorpay order creation/verification, COD order creation, automated stock deduction, courier integration and customer self-service order tracking are not yet connected. Do not accept real customer payments until these flows are implemented and tested end-to-end.

## Security
- Never commit Firebase service-account credentials, Razorpay secrets or private API keys.
- Firebase browser config is public configuration; Firestore and Storage rules enforce access.
- Only the configured admin UID can write products/categories or read/write CRM data.
- Keep the Firebase admin UID rules up to date and never leave the placeholder value in production.
- Firebase free quotas are limited and usage beyond included quotas can incur charges.
