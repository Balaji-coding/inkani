# Inkani Bites Rewards

A responsive customer loyalty wallet and cashier counter for the Inkani Bites rewards program. Customers can look up their stamps and share a link to their pass. Team members can award visits and redeem free fruit custards using a private PIN.

## Requirements

- Node.js 18 or newer
- A MongoDB Atlas database

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Replace `<db_password>` in `MONGO_URI` with the URL-encoded password for the Atlas database user, and replace `CASHIER_PIN` with a private team PIN. `MONGO_URL` is also accepted as an alias. The app requires this Atlas URI and will not fall back to a local database.
4. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from your Cloudinary account to enable product image uploads. Existing lowercase `cloudinary_cloud_name`, `cloudinary_api_key`, and `cloudinary_api_secret` names are also accepted. Configure these values in your host's environment settings rather than committing them.
5. Start the website with `npm start` (or `npm run dev` during development).
5. Visit `http://localhost:10000` (or the port set in `PORT`). The team counter is at `http://localhost:10000/cashier.html`.

The server deliberately will not start without `CASHIER_PIN` or a configured Atlas `MONGO_URI`. Do not use a public or default PIN in production. Configure the environment variables in your hosting provider rather than committing a `.env` file. Use HTTPS in production to encrypt the PIN in transit.

## Rewards

Each cashier visit adds one stamp. Every five stamps unlock one free fruit custard, with any remaining stamps carried over. Customers can have multiple unredeemed rewards. Redeeming a reward requires a customer with at least one available reward.

## API

- `GET /health` — readiness check; returns `200` when MongoDB is connected and `503` otherwise.
- `GET /api/customer/:phone` — retrieve a wallet by 10-digit phone number (an optional `+91` prefix is accepted).
- `PUT /api/customer/:phone` — initialize a rewards profile for a valid phone number when one does not exist.
- `POST /api/customer/:phone/open` — record a customer rewards-pass opening and return the updated open count.
- `POST /api/customer/:phone/rating` — save or update a customer's 1–5 star rating and optional feedback.
- `GET /api/reviews` — retrieve the latest public customer ratings and feedback.
- `POST /api/cashier/award-stamp` — JSON body: `{ "phone": "...", "billAmount": 150, "pin": "..." }`.
- `POST /api/cashier/redeem-reward` — JSON body: `{ "phone": "...", "pin": "..." }`.
- `POST /api/cashier/verify-customer` — verify a customer's rewards progress and pass-open count with `{ "phone": "...", "pin": "..." }`.
- `GET /api/store-location` — retrieve the current cart address and Google Maps link.
- `POST /api/cashier/store-location` — update `{ "address": "...", "mapsUrl": "https://www.google.com/maps/...", "pin": "..." }`.
- `GET /api/products/custard-fruit-salad` — read the storefront stock status.
- `POST /api/cashier/product-availability` — set `{ "available": true, "pin": "..." }` to manage the product's storefront status.
- `GET /api/products` — retrieve the customer-facing product catalog, including descriptions and availability.
- `POST /api/cashier/products` — create a product with multipart fields `name`, `price`, `description` (30–500 characters), `imageAlt` (10–160 characters), `available`, and an `image` file or existing image path, authenticated with the `X-Cashier-PIN` header. The response includes the product's Cloudinary HTTPS image URL in `imagePath`.
- `PUT /api/cashier/products/:id` — update an existing product with the same fields.
- `DELETE /api/cashier/products/:id` — delete a product using `{ "pin": "..." }`.

Products are stored in their own MongoDB collection through the `Product` model. The cashier requires a distinct product description and image alt text, and new menu items must have a product photo. Existing images can be updated while editing a product. Offer text such as `10% OFF` or `LIMITED OFFER` appears as a corner ribbon on the customer product image; it is a promotional label and does not automatically change the listed price. Multer keeps uploads in memory and streams them to Cloudinary; MongoDB stores each secure image URL and Cloudinary public ID. Cloudinary product images are delivered with automatic format/quality and a 1200-pixel width transformation. Existing product records in storefront settings are migrated to the product collection when the menu is first requested. The customer menu reflects product changes immediately and provides the store phone number for ordering. The cashier can optionally record a customer name and purchased items with a visit. The customer rewards pass displays the name and recent visit and purchase details. Pass-open counts are available in the cashier's customer verification section; automatic balance refreshes do not increment the count.

The customer page displays the cart's current address and a Google Maps directions link. Cashiers can update both from the Shop location section using the team PIN whenever the cart moves.

Customers can optionally rate their experience after looking up their rewards pass, and can update their rating or feedback later from the pass. Public review cards use the customer's current profile name, falling back to “Random person” if no name has been provided.

## Search visibility

Set `PUBLIC_SITE_URL` in `.env` and the hosting environment to the site's public origin, for example `https://inkani.onrender.com`. This is the single source for the homepage canonical and social metadata, business and menu structured data, product-page canonical links, sitemap, robots sitemap reference, and `llms.txt`. When moving to a custom Render domain, update this one value and configure the custom domain in Render/DNS.

The customer homepage includes a 1200×630 branded social image (`public/asserts/inkani-share-card.png`), an Instagram link to `@inkanibites`, a linked square favicon, and FoodEstablishment structured data with a 320×320 logo for Madurai. Responsive 1926×816 and 960×407 hero banners are served as 393 KB and 126 KB JPEGs rather than the 2.2 MB source PNG. The `/` route renders the current MongoDB catalog and current cart address/map into the initial HTML and structured data; the product pages and `/llms.txt` also include the latest saved cart location. Every product has a crawlable `/menu/:id` detail page with its own title, description, canonical URL, visible price/availability, Open Graph product metadata, Product/Offer structured data, and breadcrumb structured data. Product structured data includes the actual catalog price, stock status, unique catalog ID, current cart location and product photo; do not add invented review ratings. Product descriptions are formatted for readability, product photos have editable alt text, and Cloudinary images use automatic format/quality optimization. The homepage describes Inkani Bites as a trusted local Madurai food cart serving tasty fruit custard and fresh fruit salads with hygienic preparation and caring service; this wording should remain accurate to actual food-handling practices. It also describes advance bulk orders for parties, weddings, functions, and events; bulk delivery is by prior arrangement and customers should confirm availability, service area, and charges by phone. Use natural, accurate product names and descriptions rather than repeating keywords unnaturally. The dynamic `/robots.txt` and `/sitemap.xml` routes use `PUBLIC_SITE_URL`; the sitemap lists the homepage and current product pages and includes their discoverable images. Robots rules allow Googlebot, Googlebot-Image, and Google-Extended for Search and Gemini grounding. The matching files in `public/` are valid static fallbacks, while the running app's dynamic routes take precedence. The dynamic `/llms.txt` includes the live menu and current domain; `public/llms.txt` is a static-hosting fallback. Google says there are no special AI files or optimizations required for AI Overviews or AI Mode; pages must be indexed and eligible for normal Search snippets, and appearance is not guaranteed. Google-Extended controls use of public content for Gemini training and grounding but does not affect Search inclusion or ranking, and allowing it does not guarantee Gemini will cite the site. After deployment, submit `https://<PUBLIC_SITE_URL>/sitemap.xml` in Search Console, inspect the homepage and each `/menu/:id` URL, and request indexing for changed pages. Google's favicon and product image/result selection is not guaranteed and may take days or weeks to refresh. The business schema describes the service area rather than a fixed street address because the food cart moves.
