const db = require('../database');
const wgService = require('./wgService');
const crypto = require('crypto');
const { VOUCHER_PATTERN, VOUCHER_ALPHABET } = require('../config/voucher');

function validateCode(code) {
  return VOUCHER_PATTERN.test(code);
}

function findNextIp() {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const start = settings.ip_start;
  const used = db.prepare('SELECT ip_address FROM peers').all().map(r => r.ip_address);
  const base = start.split('.').slice(0,3).join('.');
  let octet = parseInt(start.split('.')[3], 10);
  while (used.includes(`${base}.${octet}`)) {
    octet++;
    if (octet > 254) throw new Error('no free IP');
  }
  return `${base}.${octet}`;
}

async function redeemVoucher(code, email, phone) {
  // normalize: trim + uppercase
  const normalized = (code || '').trim().toUpperCase();
  
  console.log(`[Voucher] Redeem attempt - Input: "${code}", Normalized: "${normalized}"`);
  
  if (!validateCode(normalized)) {
    console.log(`[Voucher] Validation failed for: "${normalized}"`);
    console.log(`[Voucher] Pattern: ${VOUCHER_PATTERN}`);
    const err = new Error('Invalid voucher code format');
    err.status = 400;
    throw err;
  }
  
  console.log(`[Voucher] Validation passed for: "${normalized}"`);
  
  const voucher = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(normalized);
  if (!voucher) {
    const err = new Error('Voucher not found');
    err.status = 404;
    throw err;
  }
  if (voucher.is_redeemed) {
    const err = new Error('Voucher already redeemed');
    err.status = 409;
    throw err;
  }

  const keys = await wgService.generatePeerKeys();
  const ip = findNextIp();
  const expires_at = new Date(Date.now() + voucher.duration_days * 86400000).toISOString();
  // insert subscription
  const accessToken = crypto.randomBytes(16).toString('hex');
  const sub = db.prepare(`
    INSERT INTO subscriptions (email, phone, voucher_id, expires_at, status, access_token)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(email, phone, voucher.id, expires_at, accessToken);
  const subscriptionId = sub.lastInsertRowid;
  // insert peer and update subscription with peer_id
  const peerStmt = db.prepare(`
    INSERT INTO peers (subscription_id, public_key, private_key, ip_address, enabled, type)
    VALUES (?, ?, ?, ?, 1, 'auto')
  `);
  const peerInfo = peerStmt.run(subscriptionId, keys.publicKey, keys.privateKey, ip);
  db.prepare('UPDATE subscriptions SET peer_id = ? WHERE id = ?').run(peerInfo.lastInsertRowid, subscriptionId);

  // mark voucher redeemed and record timestamp
  db.prepare('UPDATE vouchers SET is_redeemed = 1, redeemed_at = CURRENT_TIMESTAMP WHERE id = ?').run(voucher.id);

  await wgService.syncWireGuard();

  // build link (admin can adjust format)
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const link = `wg://${settings.server_public_ip}:${settings.server_port}?peer=${ip}`;

  return {
    access_link: link,
    ip,
    expires_at,
  };
}

module.exports = { redeemVoucher, validateCode };
