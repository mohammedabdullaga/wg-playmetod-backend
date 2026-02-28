const express = require('express');
const router = express.Router();
const subscriptionService = require('../services/subscriptionService');

// public endpoints for users who redeemed a voucher
router.get('/:token', async (req, res, next) => {
  try {
    const data = await subscriptionService.getSubscription(req.params.token);
    if (!data) return res.status(404).json({ error: 'not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:token/qr', async (req, res, next) => {
  try {
    const buf = await subscriptionService.getSubscriptionQr(req.params.token);
    if (!buf) return res.status(404).end();
    res.set('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.get('/:token/config', async (req, res, next) => {
  try {
    const txt = await subscriptionService.getSubscriptionConfig(req.params.token);
    if (!txt) return res.status(404).end();
    res.set('Content-Type', 'text/plain');
    res.send(txt);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
