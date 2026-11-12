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
