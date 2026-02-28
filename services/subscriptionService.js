const db = require('../database');
const { spawnSync } = require('child_process');
const qrcode = require('qrcode');

// helper to look up subscription and peer by access token
function _getByToken(token) {
  if (!token) return null;
  return db.prepare(
    `SELECT s.id, s.email, s.phone, s.expires_at, s.status, s.access_token,
            p.id AS peer_id, p.public_key, p.private_key, p.ip_address
     FROM subscriptions s
     LEFT JOIN peers p ON p.id = s.peer_id
     WHERE s.access_token = ?`
  ).get(token);
}

// helper that chooses between the internal and any overridden version
function _lookup(token) {
  if (module.exports && typeof module.exports._getByToken === 'function') {
    return module.exports._getByToken(token);
  }
  return _getByToken(token);
}

async function getSubscription(token) {
  const row = _lookup(token);
  if (!row) return null;

  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

  const data = {
    email: row.email,
    phone: row.phone,
    expires_at: row.expires_at,
    expiresAt: row.expires_at,
    status: row.status,
    ip_address: row.ip_address,
  };

  if (row.ip_address) {
    // generate wg url for convenience
    data.wgLink = `wg://${settings.server_public_ip}:${settings.server_port}?peer=${row.ip_address}`;
    try {
      data.qrBase64 = (await qrcode.toDataURL(data.wgLink)).split(',')[1];
    } catch (e) {
      // ignore qr failure
    }
  }

  return data;
}

async function getSubscriptionQr(token) {
  const row = _lookup(token);
  if (!row || !row.ip_address) return null;
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const link = `wg://${settings.server_public_ip}:${settings.server_port}?peer=${row.ip_address}`;
  // return PNG buffer
  return qrcode.toBuffer(link, { type: 'png' });
}

async function getSubscriptionConfig(token) {
  const row = _lookup(token);
  if (!row || !row.ip_address) return null;
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

  // attempt to query server public key from interface
  let serverPub = '';
  try {
    const iface = settings.wg_interface || 'wg0';
    const out = spawnSync('wg', ['show', iface, 'public-key']);
    if (out.status === 0) serverPub = out.stdout.toString().trim();
  } catch (e) {
    // ignore
  }

  // build simple client config (avoid leading comment – some clients reject it)
  let conf = `[Interface]\n`;
  if (row.private_key) conf += `PrivateKey = ${row.private_key}\n`;
  conf += `Address = ${row.ip_address}/32\n`;
  if (settings.client_dns) conf += `DNS = ${settings.client_dns}\n`;
  conf += `\n[Peer]\n`;
  if (serverPub) conf += `PublicKey = ${serverPub}\n`;
  conf += `Endpoint = ${settings.server_public_ip}:${settings.server_port}\n`;
  if (settings.client_allowed_ips) conf += `AllowedIPs = ${settings.client_allowed_ips}\n`;

  return conf;
}

module.exports = {
  getSubscription,
  getSubscriptionQr,
  getSubscriptionConfig,
  // exported only for tests
  _getByToken,
};
