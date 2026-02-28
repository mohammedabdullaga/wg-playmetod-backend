#!/usr/bin/env node

/**
 * Voucher Format Migration Script
 * Fixes vouchers in database that don't match the new pattern
 * Run: node fix-vouchers.js
 * 
 * ⚠️  WARNING: This modifies the database. Back it up first!
 */

const db = require('./database');
const { VOUCHER_PATTERN, VOUCHER_ALPHABET } = require('./config/voucher');

function validateCode(code) {
  return VOUCHER_PATTERN.test(code);
}

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

console.log('🔧 Voucher Format Migration\n');
console.log('This script will fix invalid vouchers in your database.\n');

try {
  const invalid = db.prepare('SELECT id, code, is_redeemed FROM vouchers').all()
    .filter(v => !validateCode(v.code));
  
  if (invalid.length === 0) {
    console.log('✅ All vouchers in database are valid! No action needed.\n');
    process.exit(0);
  }
  
  console.log(`⚠️  Found ${invalid.length} invalid vouchers:\n`);
  
  const unredeemed = invalid.filter(v => !v.is_redeemed);
  const redeemed = invalid.filter(v => v.is_redeemed);
  
  console.log(`  🟢 Unredeemed (can be fixed): ${unredeemed.length}`);
  console.log(`  🔴 Already redeemed (problematic): ${redeemed.length}\n`);
  
  if (redeemed.length > 0) {
    console.log('⚠️  WARNING: Some invalid vouchers are already marked as redeemed.');
    console.log('   These cannot be automatically fixed. They need manual review.\n');
    console.log('   Invalid redeemed vouchers:');
    redeemed.forEach(v => {
      console.log(`   - ${v.code} (ID: ${v.id})`);
    });
    console.log();
  }
  
  console.log('🔄 Fixing unredeemed vouchers...\n');
  
  let fixed = 0;
  unredeemed.forEach((v, idx) => {
    const newCode = ensureUnique(generateNewCode());
    db.prepare('UPDATE vouchers SET code = ? WHERE id = ?').run(newCode, v.id);
    console.log(`[${idx + 1}/${unredeemed.length}] ${v.code} → ${newCode}`);
    fixed++;
  });
  
  console.log(`\n✅ Fixed ${fixed} vouchers\n`);
  console.log('📋 Database has been updated. All vouchers should now work with the redemption API.\n');
  
  if (redeemed.length > 0) {
    console.log('⚠️  Note: Please manually review the redeemed invalid vouchers listed above.\n');
  }
  
  process.exit(0);

} catch (err) {
  console.error('❌ Error:', err.message);
  console.error('\nDatabase may not have been modified. Please check.');
  process.exit(1);
}
