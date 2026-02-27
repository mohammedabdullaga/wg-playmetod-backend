const express = require('express');
const router = express.Router();
const db = require('../database');
const authService = require('../services/authService');
const { requireAdmin } = require('../middleware/auth');
const wgService = require('../services/wgService');

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

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function genCode() {
    const groups = [];
    for (let g = 0; g < 4; g++) {
      let part = '';
      for (let i = 0; i < 4; i++) {
        part += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
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

module.exports = router;
