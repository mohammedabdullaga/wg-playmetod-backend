#!/usr/bin/env node

/**
 * Voucher Format Migration Script
 * Fixes vouchers in database that don't match the new pattern
 * Run: node fix-vouchers.js
 * 
 * ⚠️  WARNING: This modifies the database. Back it up first!
 */

const db = require('./database');
const { VOUCHER_ALPHABET, normalizeVoucherCode, validateNormalizedCode } = require('./config/voucher');

function generateNewCode() {
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let part = '';
    for (let i = 0; i < 4; i++) {
      part += VOUCHER_ALPHABET.charAt(Math.floor(Math.random() * VOUCHER_ALPHABET.length));
    }
    groups.push(part);
  }
  return groups.join('-');
}

function ensureUnique(code, attempts = 0) {
  if (attempts > 100) throw new Error('Could not generate unique code after 100 attempts');
  const existing = db.prepare('SELECT id FROM vouchers WHERE code = ?').get(code);
  if (existing) return ensureUnique(generateNewCode(), attempts + 1);
  return code;
}

console.log('🔧 Voucher Format Fix Script\n');
console.log('This script will fix vouchers in your database by normalizing them.\n');

try {
  const allVouchers = db.prepare('SELECT id, code, is_redeemed FROM vouchers').all();
  
  if (allVouchers.length === 0) {
    console.log('❌ No vouchers found in database!\n');
    process.exit(0);
  }
  
  // Separate valid and invalid vouchers
  const valid = allVouchers.filter(v => validateNormalizedCode(v.code));
  const invalid = allVouchers.filter(v => !validateNormalizedCode(v.code));
  
  console.log(`📊 Total vouchers: ${allVouchers.length}`);
  console.log(`   ✅ Already valid:    ${valid.length}`);
  console.log(`   ❌ Need fixing:      ${invalid.length}\n`);
  
  if (invalid.length === 0) {
    console.log('✅ All vouchers are already valid! No action needed.\n');
    process.exit(0);
  }
  
  const fixable = invalid.filter(v => normalizeVoucherCode(v.code) !== '');
  const unfixable = invalid.filter(v => normalizeVoucherCode(v.code) === '');
  
  console.log(`   📝 Can normalize (add dashes): ${fixable.length}`);
  console.log(`   ⚠️  Cannot fix (invalid chars):  ${unfixable.length}\n`);
  
  if (fixable.length > 0) {
    console.log('🔄 Normalizing fixable vouchers...\n');
    let fixed = 0;
    fixable.forEach((v, idx) => {
      const normalized = normalizeVoucherCode(v.code);
      if (normalized && normalized !== v.code) {
        db.prepare('UPDATE vouchers SET code = ? WHERE id = ?').run(normalized, v.id);
        console.log(`[${idx + 1}/${fixable.length}] ${v.code} → ${normalized}`);
        fixed++;
      }
    });
    console.log(`\n✅ Fixed ${fixed} vouchers by adding dashes\n`);
  }
  
  if (unfixable.length > 0) {
    console.log(`⚠️  WARNING: ${unfixable.length} vouchers have invalid characters and cannot be fixed.\n`);
    console.log('These will need to be manually reviewed or regenerated:');
    unfixable.forEach((v, idx) => {
      console.log(`   ${idx + 1}. ID: ${v.id}, Code: "${v.code}", Redeemed: ${v.is_redeemed ? 'YES' : 'NO'}`);
    });
    if (unfixable.filter(v => !v.is_redeemed).length > 0) {
      console.log('\nTo regenerate unredeemed invalid vouchers, run:');
      console.log('   node regenerate-vouchers.js\n');
    }
  }
  
  console.log('✅ Fix complete!\n');
  process.exit(0);

} catch (err) {
  console.error('❌ Error:', err.message);
  console.error('\nDatabase may not have been modified. Please check.');
  process.exit(1);
}
