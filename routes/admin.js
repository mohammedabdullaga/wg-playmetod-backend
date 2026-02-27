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

// create voucher
router.post('/create-voucher', requireAdmin, (req, res, next) => {
  try {
    const { code, duration_days } = req.body;
    db.prepare('INSERT INTO vouchers (code, duration_days) VALUES (?, ?)').run(code, duration_days);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/vouchers', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM vouchers').all();
  res.json(rows);
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
    res.send(status);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
