# WireGuard Management Backend (v1)

Simple Node/Express backend for managing vouchers and WireGuard peers.

## Project layout

```
backend/
├── server.js             # entrypoint
├── package.json
├── routes/
│   ├── voucher.js        # public voucher redemption
│   └── admin.js          # admin protected endpoints
├── services/
│   ├── wgService.js      # WireGuard interface
│   ├── voucherService.js # voucher logic
│   ├── expiryService.js  # subscription expiry watcher
│   ├── authService.js    # JWT & login
│   └── adminService.js   # admin user management
├── database/
│   └── index.js          # sqlite connection and schema
├── middleware/
│   └── auth.js           # admin JWT guard
├── data/                 # SQLite file lives here
├── wg-backend.service    # example systemd unit
└── nginx.conf            # example nginx proxy
```

## Getting started

1. `npm install`
2. Create a `.env` file in the backend directory:
   ```
   ADMIN_EMAIL=admin@panel.local
   ADMIN_PASSWORD=YourSecurePassword123
   ADMIN_JWT_SECRET=your-super-long-secret-key-change-this
   PORT=3000
   ```
3. On startup the server will insert a single admin row if none exists. No public registration available.
4. Run: `node server.js` 
5. Or install as systemd service: `sudo cp wg-backend.service /etc/systemd/system/ && sudo systemctl enable --now wg-backend`

### Running the small built-in test
A lightweight smoke test for a couple of internal helpers is included. You can run it with:

```bash
npm run test
```

It doesn't require a WireGuard installation and is mainly useful when editing the backend code.

## Features

- Voucher redemption (public, rate-limited)
- Single-admin login via email/password (stored hashed in DB)
- JWT-protected admin endpoints
- Settings management (WG interface, subnet, DNS, etc.)
- Dashboard overview with statistics
- Admin identity verification endpoint
- WireGuard status in JSON format
- Hourly subscription expiry enforcement
- WireGuard configuration file (`/etc/wireguard/<iface>.conf`) is treated as source of truth; peers are added/removed in the file and applied to the running interface using `wg-quick strip` + `wg syncconf` with automatic rollback on failure
- SQLite with WAL mode for concurrency

## API Endpoints

### Public
- `GET /api/health` - health check
- `POST /api/voucher/redeem` - redeem voucher (rate limited)
- `GET /api/subscription/:token` - retrieve subscription status (used by user portal)
- `GET /api/subscription/:token/qr` - returns PNG QR code for WireGuard link
- `GET /api/subscription/:token/config` - download client WireGuard configuration

> **Note:** the router is mounted at `/api/subscription/` so the paths are `/:token` … not `/subscription/:token`.

### Admin (require JWT auth)
- `POST /api/admin/login` - login with email/password
- `GET /api/admin/me` - get current admin info
- `GET /api/admin/settings` - get WG settings
- `PUT /api/admin/settings` - update WG settings
- `GET /api/admin/overview` - dashboard stats
- `GET /api/admin/wg/status` - WireGuard status (JSON)
- `GET /api/admin/vouchers` - list vouchers
- `POST /api/admin/vouchers` - create vouchers
- `GET /api/admin/subscriptions` - list subscriptions
- `PUT /api/admin/subscription/:id/disable` - disable subscription
- `PUT /api/admin/subscription/:id/extend` - extend subscription
- `POST /api/admin/import-peer` - import manual peer

## curl Examples

### Login
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@panel.local","password":"YourSecurePassword123"}' \
  | jq -r '.token')
```

### Get admin identity
```bash
curl -X GET http://localhost:3000/api/admin/me \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Get settings
```bash
curl -X GET http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Update settings
```bash
curl -X PUT http://localhost:3000/api/admin/settings \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"server_public_ip":"203.0.113.45","server_port":51820}' | jq
```

### Redeeming vouchers (user-facing behaviour)
When a voucher is successfully redeemed the backend now returns a small JSON payload containing a `token` that the frontend uses to display subscription info. Example response:
```json
{
  "token": "a1b2c3d4...",
  "userUrl": "https://wg.playmetod.store/s/a1b2c3d4...",
  "access_link": "wg://203.0.113.45:51820?peer=10.0.0.2",
  "ip": "10.0.0.2",
  "expires_at": "2026-03-30T12:34:56.000Z"
}
```

The frontend will then navigate the user to `/s/<token>` which triggers the public `subscription` endpoints.

### Get WireGuard status
```bash
curl -X GET http://localhost:3000/api/admin/wg/status \
  -H "Authorization: Bearer $TOKEN" | jq
```

### List vouchers
```bash
curl -X GET http://localhost:3000/api/admin/vouchers \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Create vouchers
```bash
curl -X POST http://localhost:3000/api/admin/vouchers \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"count":5,"durationDays":30}' | jq
```

### Dashboard overview
```bash
curl -X GET http://localhost:3000/api/admin/overview \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Notes

- All admin endpoints require `Authorization: Bearer <JWT>` header
- JWT tokens expire in 24 hours
- Settings stored in SQLite singleton row (id=1)
- Database auto-created at `backend/data/app.db`
- WAL mode enabled for better concurrency
- Run with root privileges for WireGuard access (necessary to modify `/etc/wireguard/*.conf` and execute wg commands)
