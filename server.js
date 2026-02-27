require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const voucherRouter = require('./routes/voucher');
const adminRouter = require('./routes/admin');
const expiryService = require('./services/expiryService');
const adminService = require('./services/adminService');

// create app
const app = express();

// middleware
app.use(helmet());

app.use(cors({
  origin: [
  "http://localhost:5173",
  "https://panel-wg.playmetod.store",
  "https://wg.playmetod.store"
], // adjust as needed
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// rate limit for voucher redemption
const redeemLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many redemption attempts, please try again later.',
});

app.use('/api/voucher/redeem', redeemLimiter);

// routes
app.use('/api/voucher', voucherRouter);
app.use('/api/admin', adminRouter);

// global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

// ensure an admin account exists
(async () => {
  try {
    await adminService.ensureAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    console.log('admin account checked');
  } catch (e) {
    console.error('admin setup error', e.message);
    process.exit(1);
  }
})();

// start expiry watcher
expiryService.start();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
