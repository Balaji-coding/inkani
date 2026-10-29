# Inkani Bites Rewards

A responsive customer loyalty wallet and cashier counter for the Inkani Bites rewards program. Customers can look up their stamps and share a link to their pass. Team members can award visits and redeem free fruit custards using a private PIN.

## Requirements

- Node.js 18 or newer
- MongoDB (local or hosted)

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `MONGO_URI` to your MongoDB connection string and replace `CASHIER_PIN` with a private team PIN.
4. Start the website with `npm start` (or `npm run dev` during development).
5. Visit `http://localhost:5000`. The team counter is at `http://localhost:5000/cashier.html`.

The server deliberately will not start without `CASHIER_PIN`. Do not use a public or default PIN in production. Configure the environment variables in your hosting provider rather than committing a `.env` file. Use HTTPS in production to encrypt the PIN in transit.

## Rewards

Each cashier visit adds one stamp. Every five stamps unlock one free fruit custard, with any remaining stamps carried over. Customers can have multiple unredeemed rewards. Redeeming a reward requires a customer with at least one available reward.

## API

- `GET /api/customer/:phone` — retrieve a wallet by 10-digit phone number (an optional `+91` prefix is accepted).
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

The cashier can optionally record a customer name and purchased items with a visit. The customer rewards pass displays the name and recent visit and purchase details. Pass-open counts are available in the cashier's customer verification section; automatic balance refreshes do not increment the count. The cashier can also activate or deactivate the Custard Fruit Salad listing; the customer page reflects the stock status and provides the store phone number for ordering.

The customer page displays the cart's current address and a Google Maps directions link. Cashiers can update both from the Shop location section using the team PIN whenever the cart moves.

Customers can optionally rate their experience after looking up their rewards pass, and can update their rating or feedback later from the pass. Public review cards use the customer's current profile name, falling back to “Random person” if no name has been provided.
