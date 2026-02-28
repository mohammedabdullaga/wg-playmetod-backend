const express = require('express');
const router = express.Router();
const db = require('../database');
const authService = require('../services/authService');
const { requireAdmin } = require('../middleware/auth');
const wgService = require('../services/wgService');
const { VOUCHER_ALPHABET } = require('../config/voucher');

// login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const token = await authService.login(email, password);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// voucher list (paginated later if desired)
router.get('/vouchers', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM vouchers').all();
  res.json({ items: rows, count: rows.length });
});

// create one or many vouchers
router.post('/vouchers', requireAdmin, (req, res) => {
  const { count, durationDays } = req.body;
  const NUM = parseInt(count, 10) || 1;
  const dur = parseInt(durationDays, 10);
  if (isNaN(dur) || dur <= 0) {
    return res.status(400).json({ error: 'invalid durationDays' });
  }
  if (isNaN(NUM) || NUM < 1 || NUM > 1000) {
    return res.status(400).json({ error: 'invalid count' });
  }

  function genCode() {
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

  const created = [];
  const insert = db.prepare('INSERT INTO vouchers (code, duration_days) VALUES (?, ?)');
  for (let i = 0; i < NUM; i++) {
    let code;
    let last;
    do {
      code = genCode();
      try {
        last = insert.run(code, dur);
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          continue; // collision
        }
        throw e;
      }
      break;
    } while (true);
    created.push({ code, duration_days: dur, is_redeemed: 0, created_at: new Date().toISOString() });
  }
  res.json({ created });
});

// keep old alias for compatibility
router.post('/create-voucher', requireAdmin, (req, res, next) => {
  // rewrite body and url to mimic the new /vouchers POST handler
  req.body = { count: 1, durationDays: req.body.duration_days };
  req.url = '/vouchers';
  return router.handle(req, res, next);
});

router.get('/subscriptions', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM subscriptions').all();
  res.json(rows);
});

router.put('/subscription/:id/disable', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.prepare('UPDATE subscriptions SET status = "disabled" WHERE id = ?').run(id);
  db.prepare('UPDATE peers SET enabled=0 WHERE subscription_id=?').run(id);
  wgService.syncWireGuard().catch(console.error);
  res.json({ ok: true });
});

router.put('/subscription/:id/extend', requireAdmin, (req, res) => {
  const id = req.params.id;
  const { days } = req.body;
  db.prepare('UPDATE subscriptions SET expires_at = datetime(expires_at, ? || " days") WHERE id = ?').run(days, id);
  res.json({ ok: true });
});

router.post('/import-peer', requireAdmin, async (req, res, next) => {
  try {
    const { public_key, ip_address } = req.body;
    const info = await wgService.importManualPeer(public_key);
    // store peer as manual with no subscription
    db.prepare(
      "INSERT INTO peers (public_key, private_key, ip_address, enabled, type) VALUES (?,NULL,?,1,'manual')"
    ).run(info.publicKey, ip_address);
    await wgService.syncWireGuard();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/wg/status', requireAdmin, async (req, res, next) => {
  try {
    const status = await wgService.getWireGuardStatus();
    res.setHeader('Content-Type', 'application/json');
    res.json(status);
  } catch (err) {
    console.error('wg status error', err);
    res.status(500).json({ error: 'wg status failed', details: err.message });
  }
});

// get current admin identity
router.get('/me', requireAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

// get settings
router.get('/settings', requireAdmin, (req, res) => {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!settings) {
    return res.status(404).json({ error: 'settings not found' });
  }
  res.json(settings);
});

// update settings (all fields optional)
router.put('/settings', requireAdmin, (req, res) => {
  const {
    wg_interface,
    subnet,
    ip_start,
    server_public_ip,
    server_port,
    client_dns,
    client_allowed_ips,
  } = req.body;

  const updates = [];
  const values = [];

  if (wg_interface !== undefined) {
    updates.push('wg_interface = ?');
    values.push(wg_interface);
  }
  if (subnet !== undefined) {
    updates.push('subnet = ?');
    values.push(subnet);
  }
  if (ip_start !== undefined) {
    updates.push('ip_start = ?');
    values.push(ip_start);
  }
  if (server_public_ip !== undefined) {
    updates.push('server_public_ip = ?');
    values.push(server_public_ip);
  }
  if (server_port !== undefined) {
    updates.push('server_port = ?');
    values.push(server_port);
  }
  if (client_dns !== undefined) {
    updates.push('client_dns = ?');
    values.push(client_dns);
  }
  if (client_allowed_ips !== undefined) {
    updates.push('client_allowed_ips = ?');
    values.push(client_allowed_ips);
  }

  if (updates.length === 0) {
    // no changes, just return current
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    return res.json(settings);
  }

  values.push(1); // WHERE id = 1
  const sql = `UPDATE settings SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values);

  const updated = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  res.json(updated);
});

// dashboard overview / stats
router.get('/overview', requireAdmin, (req, res) => {
  const vouchers = db.prepare('SELECT COUNT(*) as total FROM vouchers').get();
  const vouchersRedeemed = db.prepare('SELECT COUNT(*) as total FROM vouchers WHERE is_redeemed = 1').get();
  const subscriptions = db.prepare('SELECT COUNT(*) as total FROM subscriptions').get();
  const peers = db.prepare('SELECT COUNT(*) as total FROM peers WHERE enabled = 1').get();

  res.json({
    vouchers: {
      total: vouchers.total,
      redeemed: vouchersRedeemed.total,
      available: vouchers.total - vouchersRedeemed.total,
    },
    subscriptions: subscriptions.total,
    peers: peers.total,
  });
});

module.exports = router;
