const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../data/app.db');
const db = new Database(dbPath);

// run migrations / ensure tables exist
function init() {
  const create = db.prepare.bind(db);

  create(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      duration_days INTEGER,
      is_redeemed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  create(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  create(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      phone TEXT,
      voucher_id INTEGER,
      peer_id INTEGER,
      expires_at DATETIME,
      status TEXT,
      access_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  create(`
    CREATE TABLE IF NOT EXISTS peers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER,
      public_key TEXT,
      private_key TEXT,
      ip_address TEXT,
      enabled INTEGER DEFAULT 1,
      type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  create(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      wg_interface TEXT,
      subnet TEXT,
      ip_start TEXT,
      server_public_ip TEXT,
      server_port INTEGER,
      client_dns TEXT,
      client_allowed_ips TEXT
    )
  `).run();

  // insert default settings row if none
  const row = db.prepare('SELECT COUNT(*) as cnt FROM settings').get();
  if (row.cnt === 0) {
    db.prepare(
      `INSERT INTO settings
      (id, wg_interface, subnet, ip_start, server_public_ip, server_port, client_dns, client_allowed_ips)
      VALUES (1, 'wg0', '10.0.0.0/24', '10.0.0.5', 'YOUR_SERVER_IP', 51820, '8.8.8.8', '0.0.0.0/0')`
    ).run();
  }
}

init();

module.exports = db;
