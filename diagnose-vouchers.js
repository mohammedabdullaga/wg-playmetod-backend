#!/usr/bin/env node

/**
 * Voucher Diagnostic Script
 * Shows all vouchers in the database and checks their format
 * Run: node diagnose-vouchers.js
 */

const db = require('./database');
const { VOUCHER_ALPHABET, VOUCHER_PATTERN_STRICT, normalizeVoucherCode, validateNormalizedCode } = require('./config/voucher');

console.log('🔍 Voucher Diagnostic Report\n');
console.log('Alphabet:', VOUCHER_ALPHABET);
console.log('Pattern (strict):', VOUCHER_PATTERN_STRICT);
console.log('='.repeat(80));

try {
  const vouchers = db.prepare('SELECT id, code, duration_days, is_redeemed, created_at FROM vouchers ORDER BY id DESC LIMIT 20').all();
  
  if (vouchers.length === 0) {
    console.log('\n❌ No vouchers found in database!\n');
    process.exit(0);
  }
  
  console.log(`\n📊 Found ${vouchers.length} recent vouchers:\n`);
  
  let validCount = 0;
  let invalidCount = 0;
  let fixableCount = 0;
  
  vouchers.forEach((v, idx) => {
    const normalized = normalizeVoucherCode(v.code);
    const isValid = normalized && validateNormalizedCode(normalized);
    const status = isValid ? '✅' : '❌';
    const redeemStatus = v.is_redeemed ? '🔴 REDEEMED' : '🟢 AVAILABLE';
    
    if (isValid) validCount++;
    else invalidCount++;
    
    // Check if it can be fixed (valid chars but missing dashes)
    if (!isValid && normalized) fixableCount++;
    
    console.log(`[${idx + 1}] ${status} ${v.code} ${redeemStatus}`);
    console.log(`    Duration: ${v.duration_days} days | Created: ${v.created_at}`);
    
    if (!isValid) {
      console.log(`    💡 Normalized would be: "${normalized}"`);
      
      if (!normalized) {
        console.log(`    ❌ Cannot be normalized - invalid characters or wrong length`);
        const cleaned = v.code.trim().toUpperCase().replace(/-/g, '');
        console.log(`       Length: ${cleaned.length} chars (should be exactly 16)`);
      }
    }
    console.log();
  });
  
  console.log('='.repeat(80));
  console.log(`\n📈 Summary:`);
  console.log(`   ✅ Valid vouchers:     ${validCount}`);
  console.log(`   ⚠️  Fixable vouchers:   ${fixableCount} (missing dashes but valid)`);
  console.log(`   ❌ Invalid vouchers:   ${invalidCount}`);
  
  if (invalidCount > 0 || fixableCount > 0) {
    console.log(`\n💡 The backend now accepts codes with OR without dashes!`);
    console.log(`   Codes are automatically normalized to: XXXX-XXXX-XXXX-XXXX`);
    console.log(`   For example: "TEFD8MN5D99Q48MW" → "TEFD-8MN5-D99Q-48MW"`);
    if (!validCount && fixableCount > 0) {
      console.log(`\n✅ All your vouchers are fixable! They should work immediately.`);
    }
  }
  
  process.exit(0);

} catch (err) {
  console.error('❌ Error reading database:', err.message);
  console.error('\nMake sure you\'re in the backend directory and database is initialized.');
  process.exit(1);
}
