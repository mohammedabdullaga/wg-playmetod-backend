# Voucher Redemption Fix - Summary

## Issues Fixed

### 1. X-Forwarded-For Trust Proxy Warning
**Error**: `ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false`

**Root Cause**: Backend is behind a reverse proxy (nginx/load balancer) but Express wasn't configured to trust it.

**Fix**: Added `app.set('trust proxy', true)` to `server.js`

### 2. Voucher Format Mismatch
**Error**: Voucher code `TEFD8MN5D99Q48MW` (no dashes) rejected as "Invalid voucher code format"

**Root Cause**: Your admin panel generates vouchers WITHOUT dashes (16 raw characters), but the backend validator required dashes (XXXX-XXXX-XXXX-XXXX).

**Fix**: Updated the voucher validation system to:
- Accept BOTH formats (with or without dashes)
- Automatically normalize codes by adding dashes
- Example: `TEFD8MN5D99Q48MW` → `TEFD-8MN5-D99Q-48MW`

## Files Updated

### Backend Code
- **server.js** - Added `app.set('trust proxy', true)`
- **config/voucher.js** - NEW shared configuration with normalization function
- **services/voucherService.js** - Uses new normalization function
- **routes/admin.js** - Uses shared config
- **diagnose-vouchers.js** - Updated to show normalization info
- **fix-vouchers.js** - Simplified to normalize existing codes

### Key Changes

**Before**:
```javascript
const VOUCHER_PATTERN = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;
function validateCode(code) {
  return VOUCHER_PATTERN.test(code);
}
```

**After**:
```javascript
function normalizeVoucherCode(code) {
  // "TEFD8MN5D99Q48MW" → "TEFD-8MN5-D99Q-48MW"
  const cleaned = code.trim().toUpperCase().replace(/-/g, '');
  if (cleaned.length !== 16) return '';
  if (!VALID_CHARS.test(cleaned)) return '';
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}`;
}
```

## How It Works Now

1. **User submits voucher code** (with or without dashes)
   - `TEFD8MN5D99Q48MW` or `TEFD-8MN5-D99Q-48MW`

2. **Backend normalizes the code**
   - Trim whitespace
   - Convert to uppercase
   - Remove any existing dashes
   - Check length (must be 16 chars)
   - Validate characters
   - Add dashes to create standard format: `TEFD-8MN5-D99Q-48MW`

3. **Database lookup uses normalized code**
   - All vouchers stored with dashes for consistency

4. **Success or error returned**
   - ✅ Valid: Return subscription details
   - ❌ Invalid format: 400 Bad Request
   - ❌ Not found: 404 Not Found
   - ❌ Already redeemed: 409 Conflict

## Testing the Fix

### 1. Check Your Database
```bash
cd /root/playme-ios/backend
node diagnose-vouchers.js
```

Expected output:
```
✅ Valid vouchers: X
⚠️  Fixable vouchers: X (missing dashes but valid)
❌ Invalid vouchers: 0
```

### 2. Normalize Existing Codes (Optional)
```bash
node fix-vouchers.js
```

This will update codes like `TEFD8MN5D99Q48MW` to `TEFD-8MN5-D99Q-48MW` in the database.

### 3. Restart Backend
```bash
sudo systemctl restart wgbackend.service
sleep 5
```

### 4. Test Redemption
```bash
curl -X POST http://localhost:3000/api/voucher/redeem \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEFD8MN5D99Q48MW",
    "email": "test@example.com"
  }'
```

Expected response (200 OK):
```json
{
  "access_link": "wg://...",
  "ip": "10.0.0.2",
  "expires_at": "2026-03-30T12:34:56.000Z"
}
```

## Server Logs

You should now see in logs:
```
[Voucher] Redeem attempt - Input: "TEFD8MN5D99Q48MW", Normalized: "TEFD-8MN5-D99Q-48MW"
[Voucher] Validation passed for: "TEFD-8MN5-D99Q-48MW"
```

Instead of:
```
[Voucher] Validation failed for: "TEFD8MN5D99Q48MW"
```

## Voucher Format Rules

The system now accepts and automatically normalizes voucher codes:

- **Input formats accepted**:
  - `TEFD8MN5D99Q48MW` (16 chars, no dashes)
  - `TEFD-8MN5-D99Q-48MW` (with dashes)
  - `tefd8mn5d99q48mw` (lowercase - auto converted)

- **Alphabet**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O, I, 0, 1)

- **Stored format**: Always with dashes `XXXX-XXXX-XXXX-XXXX`

## Trust Proxy Configuration

Your backend is now correctly configured to work behind a reverse proxy:

```javascript
app.set('trust proxy', true);
```

This allows:
- Rate limiting to work correctly (uses client IP from X-Forwarded-For)
- Proper client IP logging
- Session handling in proxied environments

## Next Steps

1. **Deploy the changes** to your server
2. **Restart the backend service**
3. **Run** `node diagnose-vouchers.js` to verify your database
4. **Optionally run** `node fix-vouchers.js` to normalize existing codes
5. **Test** voucher redemption with a fresh voucher from the admin panel

Both old and new codes will work immediately - no database migration required!
