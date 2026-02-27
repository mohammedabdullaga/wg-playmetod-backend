# WireGuard Management Backend (v1)

Simple Node/Express backend for managing vouchers and WireGuard peers.

## Project layout
```
backend/
├── server.js             # entrypoint
├── package.json
├── routes/
│   ├── voucher.js
│   └── admin.js
├── services/
│   ├── wgService.js
│   ├── voucherService.js
│   ├── expiryService.js
│   └── authService.js
├── database/
│   └── index.js          # sqlite connection and schema
├── middleware/
│   └── auth.js           # admin JWT guard
├── utils/
│   └── validators.js
├── data/                 # SQLite file lives here
├── wg-backend.service    # example systemd unit
└── nginx.conf            # example nginx proxy
```

## Getting started
1. `npm install`
2. create a `.env` file in the backend directory containing at least:
   ```
   ADMIN_EMAIL=admin@panel.local
   ADMIN_PASSWORD=$Mm900103590
   ADMIN_JWT_SECRET=some-long-secret
   ```
3. on startup the server will insert a single admin row if none exists.  No public
   registration is available.
4. run as root: `node server.js` or install `wg-backend.service` under `/etc/systemd/system`.
5. point nginx or Caddy at localhost:3000.

## Features
- Voucher redemption
- Single‑admin login via email/password (credentials set in `.env`, stored hashed in DB)
- JWT‑protected admin endpoints for managing vouchers, subscriptions, peers, and wg status
- Hourly expiry enforcement
- WireGuard sync via `wg syncconf`

Security and validation kept minimal but structural; expand as needed.
