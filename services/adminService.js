const db = require('../database');
const bcrypt = require('bcrypt');

async function ensureAdmin(email, plainPassword) {
  const existing = db.prepare('SELECT * FROM admins LIMIT 1').get();
  if (existing) return existing;
  if (!email || !plainPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }
  const hash = await bcrypt.hash(plainPassword, 10);
  const info = db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(email, hash);
  return { id: info.lastInsertRowid, email };
}

function getAdminByEmail(email) {
  if (!email) return null;
  return db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
}

module.exports = { ensureAdmin, getAdminByEmail };
