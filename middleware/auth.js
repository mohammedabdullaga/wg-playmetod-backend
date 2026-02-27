const authService = require('../services/authService');
const adminService = require('../services/adminService');

async function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing token' });
  }
  const token = auth.slice(7);
  const data = authService.verify(token);
  if (!data) return res.status(401).json({ error: 'invalid token' });
  // ensure the referenced admin still exists
  const admin = adminService.getAdminByEmail(data.email);
  if (!admin) return res.status(401).json({ error: 'invalid token' });
  req.admin = data;
  next();
}

module.exports = { requireAdmin };
