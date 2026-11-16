# CartVanta Admin & CRM setup

This repository now includes the first Admin/CRM implementation. It requires a NEW Firebase project owned by the CartVanta operator.

## 1. Create the Firebase project
1. Open https://console.firebase.google.com/ and choose Add project.
2. Project name: CartVanta (or another unique project ID).
3. Create a Web app named CartVanta Web and copy its Firebase web configuration.
4. Enable Authentication > Sign-in method > Email/Password.
5. Create your own admin user in Authentication > Users. Do not enable public sign-up.

## 2. Configure the website
1. Replace the placeholders in `firebase-config.js` with the Web App config from the new project.
2. In Firebase Console > Firestore Database, create the database in production mode.
3. In Firebase Console > Storage, get started with the default bucket.
4. Sign in once at `/admin.html` with your admin email and password.
5. Copy that user's UID from Authentication > Users.
6. Replace `REPLACE_WITH_ADMIN_FIREBASE_AUTH_UID` in BOTH `firestore.rules` and `storage.rules` with the exact UID.
7. Publish Firestore and Storage rules in their respective Firebase Console pages. Do not leave the placeholder UID in production.

## 3. Vercel
The static Admin Panel is served at `/admin.html`. Redeploy after the GitHub changes and Firebase config are committed.

## 4. Admin features
- Dashboard: product count, stock units, order count, paid order revenue, low-stock alerts and recent orders.
- Categories: add/edit category and active/hidden status.
- Products: add/edit/delete product records, multiple image uploads, SKU, category, cost, selling price, MRP, stock, tags, description and draft/published status.
- Orders & CRM: view orders and update fulfilment status and internal remarks.
- Customers: customer directory.

## 5. Firestore data model
- `products`: name, sku, categoryId, categoryName, cost, price, mrp, stock, images[], description, tags[], status, createdAt, updatedAt.
- `categories`: name, slug, status, createdAt, updatedAt.
- `orders`: orderNumber, customerName, phone, total, paymentStatus, status, adminRemark, createdAt, updatedAt.
- `customers`: name, email, phone, orderCount, createdAt, updatedAt.

## Security notes
- Rules restrict writes and all CRM data to the single configured admin UID. Published products and active categories are public-readable.
- Never put Firebase Admin SDK service-account credentials, Razorpay secrets, or private API keys in browser code or GitHub.
- Do not use test payment endpoints for real orders. A separate server-side checkout implementation must recalculate prices from Firestore, recheck stock, verify Razorpay signatures/webhooks, and write orders safely before real payments are enabled.
- Firebase web config is public client configuration; Firestore and Storage security rules provide the access control.
- Firebase free quotas are limited and can incur charges if exceeded. Review the current Firebase billing plan and usage.
