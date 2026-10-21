# SMS transaction tracker

A local-first transaction dashboard built with Express, SQLite, React, Vite, Tailwind CSS, and Recharts. Bank SMS text is parsed in memory and discarded after saving the transaction. Amounts, merchant names, and account suffixes are encrypted in SQLite with AES-256-GCM.

## Run locally

```bash
npm install
cp .env.example .env
```

Generate a 32-byte key twice, using a different value for each of `TRANSACTION_ENCRYPTION_KEY` and `TRANSACTION_SESSION_SECRET` in `.env`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the two generated values into their corresponding `.env` entries. Set `TRANSACTION_APP_USERNAME` and `TRANSACTION_APP_PASSWORD`. Local development accepts passwords of at least 8 characters; production requires at least 12. Do not reuse a short development password for deployment.

Then run the API and Vite dashboard:

```bash
npm run dev
```

Open <http://127.0.0.1:5173>. The API binds to loopback by default at port 3001; Vite proxies `/api` requests to it. To create a production frontend build, run `npm run build`. For production, configure the environment and run `npm start` to serve the API; serve the generated `dist/` directory with a static web server that proxies `/api` to the API process.

Both keys must decode to exactly 32 bytes, supplied as 64 hexadecimal characters or Base64. Keep them private and backed up: losing or rotating the encryption key makes existing encrypted transaction details unreadable; rotating the session secret signs out active sessions. The SQLite database is stored under `data/` by default and is gitignored. The API binds only to `127.0.0.1`.

## Deploy frontend to Vercel and keep SQLite on a VPS

The app uses a username/password login, signed HTTP-only session cookies, exact-origin checks, and login rate limiting. Vercel serves the Vite build and forwards `/api/*` requests through `api/[...path].js` to the VPS API. This keeps browser requests same-origin and avoids third-party cookie restrictions.

1. Import this repository in Vercel. Keep the Vercel project **Root Directory** at `./` (the repository root), with build command `npm run build` and output directory `dist`. The included `vercel.json` configures these defaults.
2. Set the Vercel environment variable `TRANSACTION_API_ORIGIN` to the VPS API's HTTPS origin, for example `https://tracker-api.example.com` (origin only; no path or trailing API endpoint). This is not a secret; it is the API proxy destination.
3. Deploy the API on a VPS with Node.js 24, keeping the SQLite data directory on persistent storage. Put Nginx or Caddy with HTTPS in front of the API and proxy to `127.0.0.1:3001`; do not expose the app's HTTP port directly.
4. On the VPS, set `NODE_ENV=production`, `APP_ORIGINS` to the exact Vercel site origin (for example `https://your-project.vercel.app`), and the private values `TRANSACTION_ENCRYPTION_KEY`, `TRANSACTION_SESSION_SECRET`, `TRANSACTION_APP_USERNAME`, and `TRANSACTION_APP_PASSWORD`. Use a unique password of at least 12 characters. Generate each key separately. Never put these credentials or secrets in GitHub or Vercel; only the API origin belongs in Vercel.
5. Back up the SQLite file and encryption key together. Use a strong, unique app password.

The VPS API origin must be reachable over HTTPS from Vercel. The UI and API are protected by the app password; Vercel preview URLs are not automatically trusted by the API. Add an exact preview origin to `APP_ORIGINS` only when needed. For a personal financial app, use a private repository and avoid sharing preview or production access.

## API

- `POST /api/parse-sms` — body: `{ "rawSms": "..." }`; parses and saves one transaction. SMS input is limited to 5,000 characters and is not persisted.
- `GET /api/dashboard-summary` — monthly debit total, category breakdown, daily spending, count, top category, and the ten newest transactions.
- `GET /api/transactions?category=Food&q=swiggy&limit=100` — transaction history with category/search filters and a bounded result count.

Account suffixes in API transaction responses are masked. Transaction type and date are stored in plaintext for summaries; amount, merchant, and account suffix are encrypted.

Run the focused tests from this directory with `npm test`.
