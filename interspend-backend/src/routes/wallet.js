const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../db');
const { getWalletForUser } = require('../services/walletService');

const router = express.Router();

// GET /api/wallet
router.get('/wallet', auth, async (req, res) => {
  try {
    const wallet = await getWalletForUser(req.user.id);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({
      currency: wallet.currency,
      availableBalance: wallet.availableBalance,
      reservedBalance: wallet.reservedBalance,
      tierStatus: wallet.tierStatus,
      transactions: wallet.transactions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const transactions = await prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(transactions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
