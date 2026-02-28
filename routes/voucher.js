const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');

router.post('/redeem', async (req, res, next) => {
  try {
    const { code, email, phone } = req.body;
    
    // Basic validation of input
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Voucher code is required' });
    }
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const result = await voucherService.redeemVoucher(code, email, phone);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
