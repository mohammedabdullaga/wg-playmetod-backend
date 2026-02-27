const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const adminService = require('./adminService');

const SECRET = process.env.ADMIN_JWT_SECRET || 'CHANGE_ME';

async function login(email, password) {
  const admin = adminService.getAdminByEmail(email);
  if (!admin) throw new Error('invalid credentials');
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) throw new Error('invalid credentials');
  return jwt.sign({ email }, SECRET, { expiresIn: '24h' });
}

function verify(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { login, verify };

