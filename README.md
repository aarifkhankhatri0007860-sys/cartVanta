# CartVanta

CartVanta custom storefront for India and USA market exploration.

## Deployment
- Import this GitHub repository into Vercel.
- Framework preset: Other.
- Build command: leave blank.
- Output directory: leave blank / root.
- Add Environment Variable `CJ_API_KEY` in Vercel (never commit the key to GitHub).
- Redeploy after adding the variable.

## Supplier integration
The serverless endpoint `/api/cj-products` exchanges the server-side CJ API key for an access token and queries CJ's product catalogue. The key and access token are never sent to the browser.

## Current limitations
This initial integration is catalogue browsing only. Product importing, verified landed-cost calculations, customer accounts, inventory webhooks, payment capture, COD eligibility, order submission and fulfilment automation are not enabled. Do not accept customer payments until these flows are implemented and tested.

## Support
fundvexxasupport@gmail.com


## Razorpay integration test (India)
- Add `RAZORPAY_TEST_KEY_ID` and `RAZORPAY_TEST_KEY_SECRET` in Vercel. Never commit secrets.
- After deployment, open `/payment-test.html` to run a fixed ₹1 TEST-MODE payment.
- The server creates the order using fixed INR 100 paise; the browser cannot set the amount.
- The verification endpoint checks the HMAC-SHA256 signature using the test secret.
- This is only an integration test, not a product checkout. Do not accept customer orders/payments until product pricing, shipping, taxes, order persistence, stock recheck, refunds/returns and CJ fulfilment are implemented and tested.
- Live keys remain separate and are not used by these test endpoints.
