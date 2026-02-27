const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');

router.post('/redeem', async (req, res, next) => {
  try {
    const { code, email, phone } = req.body;
    const result = await voucherService.redeemVoucher(code, email, phone);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
