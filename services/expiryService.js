const db = require('../database');
const wgService = require('./wgService');

function enforceExpiry() {
  const now = new Date().toISOString();
  const expiredSubs = db.prepare(
    "SELECT * FROM subscriptions WHERE status = 'active' AND expires_at <= ?"
  ).all(now);
  if (expiredSubs.length === 0) return;

  const peerIds = expiredSubs.map(s => s.peer_id).filter(Boolean);

  expiredSubs.forEach(s => {
    db.prepare("UPDATE subscriptions SET status='expired' WHERE id=?").run(s.id);
  });

  if (peerIds.length) {
    db.prepare("UPDATE peers SET enabled=0 WHERE id IN (" + peerIds.map(()=>'?').join(',') + ")").run(...peerIds);
    wgService.syncWireGuard().catch(console.error);
  }
}

let interval;

function start() {
  interval = setInterval(enforceExpiry, 60 * 60 * 1000); // every hour
}

module.exports = { start, enforceExpiry };
