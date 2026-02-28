# Voucher Redemption - Fix Instructions

**Problem**: Vouchers created from the admin panel fail with "Invalid voucher code format" when trying to redeem.

**Root Cause**: Mismatch between voucher generation and validation, or outdated cached backend code.

## Quick Fix (5 minutes)

### Step 1: Check Database State
```bash
cd /root/playme-ios/backend
node diagnose-vouchers.js
```

This will show:
- All vouchers in database
- Which ones are valid/invalid
- Why they failed (if any)

### Step 2: Restart Backend Service
```bash
sudo systemctl restart wgbackend.service
sleep 5
sudo journalctl -u wgbackend.service -n 30 --no-pager
```

### Step 3: Fix Any Invalid Vouchers
```bash
node fix-vouchers.js
```

This script will:
- Identify invalid vouchers
- Regenerate them with the correct format
- Update the database
- Report results

### Step 4: Test
1. Create a new voucher via the admin panel
2. The code should look like: `XXXX-XXXX-XXXX-XXXX` 
3. Try to redeem it in the user panel
4. Check the server logs:
```bash
sudo journalctl -u wgbackend.service -f --no-pager
```

You should see:
```
[Voucher] Redeem attempt - Input: "...", Normalized: "..."
[Voucher] Validation passed for: "..."
```

## What Was Fixed

### Centralized Config
Created `config/voucher.js` to ensure generation and validation use the **exact same alphabet and pattern**:

```javascript
// config/voucher.js
const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VOUCHER_PATTERN = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;
```

### Updated Files
- **services/voucherService.js** - Now imports from `config/voucher.js`
- **routes/admin.js** - Voucher generation now uses shared config
- **diagnose-vouchers.js** - Uses same config for validation
- **fix-vouchers.js** - Uses same config for regeneration

## Voucher Format

- **Pattern**: `XXXX-XXXX-XXXX-XXXX` (4 groups of 4 chars with dashes)
- **Alphabet**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  - Uppercase letters only: A-H, J-N, P-Z (excludes confusing I, O)
  - Digits only: 2-9 (excludes confusing 0, 1)
- **Examples**:
  - ✅ `T4E8-X7W7-3TFM-H2SU`
  - ✅ `AAAA-BBBB-CCCC-DDDD`
  - ❌ `SPECIAL-CODE-HERE-INVALID` (too long)
  - ❌ `T4E8-X7W7-3TFM-O2SU` (contains O)

## Troubleshooting

### "Invalid voucher code format" - Still occurring?
1. Check the diagnostic output: `node diagnose-vouchers.js`
2. Run the fix script: `node fix-vouchers.js`
3. Restart the backend: `sudo systemctl restart wgbackend.service`
4. Create a brand new test voucher
5. Check logs: `sudo journalctl -u wgbackend.service -f --no-pager`

### Logs show "Invalid voucher code format" with details?
The logs include:
- Input code received
- Normalized code (after trim + uppercase)
- Validation pattern used

Review these to understand what's being sent vs. what's expected.

### Database corrupted or inconsistent?
If you have a mix of valid and invalid vouchers and want a clean state:

```bash
# Backup current database
cp /root/playme-ios/backend/data/app.db /root/playme-ios/backend/data/app.db.backup

# Fix invalid vouchers
node fix-vouchers.js
```

## Testing via curl

```bash
# Get all vouchers (admin)
curl http://localhost:3000/api/admin/vouchers \
  -H "Authorization: Bearer <token>"

# Create vouchers (admin)
curl -X POST http://localhost:3000/api/admin/vouchers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"count": 5, "durationDays": 30}'

# Redeem voucher (user)
curl -X POST http://localhost:3000/api/voucher/redeem \
  -H "Content-Type: application/json" \
  -d '{
    "code": "XXXX-XXXX-XXXX-XXXX",
    "email": "user@example.com",
    "phone": ""
  }'
```

## Files Changed
- **config/voucher.js** - NEW (shared configuration)
- **services/voucherService.js** - Updated to use config
- **routes/admin.js** - Updated to use config
- **diagnose-vouchers.js** - NEW (diagnostic tool)
- **fix-vouchers.js** - NEW (repair tool)

## Support
If issues persist after following these steps:
1. Run `diagnose-vouchers.js` and save output
2. Check `sudo journalctl -u wgbackend.service -n 100 --no-pager`
3. Review the voucher codes shown in diagnostic output
4. Check if any codes contain: O, I, 0, 1, or have wrong dash/length
