#!/usr/bin/env node

/**
 * Voucher Diagnostic Script
 * Shows all vouchers in the database and checks their format
 * Run: node diagnose-vouchers.js
 */

const db = require('./database');
const { VOUCHER_PATTERN, VOUCHER_ALPHABET } = require('./config/voucher');

function validateCode(code) {
  return VOUCHER_PATTERN.test(code);
}

console.log('🔍 Voucher Diagnostic Report\n');
console.log('Alphabet:', VOUCHER_ALPHABET);
console.log('Pattern:', VOUCHER_PATTERN);
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
  
  vouchers.forEach((v, idx) => {
    const isValid = validateCode(v.code);
    const status = isValid ? '✅' : '❌';
    const redeemStatus = v.is_redeemed ? '🔴 REDEEMED' : '🟢 AVAILABLE';
    
    if (isValid) validCount++;
    else invalidCount++;
    
    console.log(`[${idx + 1}] ${status} ${v.code} ${redeemStatus}`);
    console.log(`    Duration: ${v.duration_days} days | Created: ${v.created_at}`);
    
    if (!isValid) {
      // Analyze why it's invalid
      const hasInvalidChars = /[OI01\-]/.test(v.code.replace(/-/g, ''));
      const hasOorI = /[OI]/.test(v.code);
      const has01 = /[01]/.test(v.code);
      const dashCount = (v.code.match(/-/g) || []).length;
      const parts = v.code.split('-');
      const wrongLength = parts.some(p => p.length !== 4);
      
      console.log(`    ❌ Issues:`);
      if (hasOorI) console.log(`       - Contains confusing letters O or I`);
      if (has01) console.log(`       - Contains confusing digits 0 or 1`);
      if (wrongLength) console.log(`       - Some groups aren't 4 characters long (found: ${parts.map(p => p.length).join(',')})`);
      if (dashCount !== 3) console.log(`       - Has ${dashCount} dashes instead of 3`);
      
      // Show normalization attempt
      const normalized = v.code.trim().toUpperCase();
      const normalizedValid = validateCode(normalized);
      console.log(`    → After normalization: "${normalized}" → ${normalizedValid ? '✅ VALID' : '❌ STILL INVALID'}`);
    }
    console.log();
  });
  
  console.log('='.repeat(80));
  console.log(`\n📈 Summary:`);
  console.log(`   ✅ Valid vouchers:   ${validCount}`);
  console.log(`   ❌ Invalid vouchers: ${invalidCount}`);
  
  if (invalidCount > 0) {
    console.log(`\n⚠️  ACTION NEEDED:\n   Your admin panel is generating vouchers that don't match the backend pattern!`);
    console.log(`   The pattern should be: XXXX-XXXX-XXXX-XXXX`);
    console.log(`   With alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no O, I, 0, 1)\n`);
  }
  
  process.exit(0);

} catch (err) {
  console.error('❌ Error reading database:', err.message);
  console.error('\nMake sure you\'re in the backend directory and database is initialized.');
  process.exit(1);
}
