const express = require('express');
const auth = require('../middleware/auth');
const { applyNfcPayment } = require('../services/walletService');

const router = express.Router();

// POST /api/nfc/tap
router.post('/tap', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });

    const tx = await applyNfcPayment(req.user.id, Number(amount));
    res.json({ ok: true, tx });
  } catch (err) {
    console.error(err);
    if (err.message === 'Insufficient funds') return res.status(402).json({ error: 'Insufficient funds' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
