const express = require('express');
const prisma = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// Simple mock rate provider
function getMockRate(from, to) {
  if (from === 'ZAR' && to === 'USD') return 0.056;
  if (from === 'ZAR' && to === 'EUR') return 0.051;
  if (from === 'USD' && to === 'ZAR') return 18;
  return 1;
}

// POST /api/convert
router.post('/convert', auth, async (req, res) => {
  try {
    const { source, target, amount } = req.body;
    if (!source || !target || !amount) return res.status(400).json({ error: 'Missing fields' });

    const rate = getMockRate(source, target);
    const amountTarget = Number(amount) * rate;

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(500).json({ error: 'User wallet not found' });

    const partialReserve = Number(amount) * 0.5;

    const conv = await prisma.conversionRequest.create({
      data: {
        userId: req.user.id,
        sourceCurrency: source,
        targetCurrency: target,
        amountSource: amount,
        amountTargetEst: amountTarget,
        status: 'PENDING'
      }
    });

    // Reserve logic: if availableBalance covers partialReserve subtract, otherwise simulate top-up by setting available to 0
    const available = Number(wallet.availableBalance);
    let newAvailable = available;
    let newReserved = Number(wallet.reservedBalance);

    if (available >= partialReserve) {
      newAvailable = available - partialReserve;
      newReserved = newReserved + partialReserve;
    } else {
      newAvailable = 0;
      newReserved = newReserved + partialReserve;
    }

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: newAvailable.toString(),
        reservedBalance: newReserved.toString()
      }
    });

    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount: partialReserve,
        currency: source,
        type: 'CONVERSION',
        metadata: { conversionRequestId: conv.id }
      }
    });

    res.status(201).json({ conversionRequest: conv, reserved: partialReserve });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/webhook/conversion-callback
router.post('/webhook/conversion-callback', async (req, res) => {
  try {
    const { conversionRequestId, status } = req.body;
    if (!conversionRequestId || !status) return res.status(400).json({ error: 'Missing fields' });

    const conv = await prisma.conversionRequest.update({
      where: { id: conversionRequestId },
      data: { status }
    });

    if (status === 'CONFIRMED') {
      const wallet = await prisma.wallet.findUnique({ where: { userId: conv.userId } });
      if (!wallet) return res.status(500).json({ error: 'Wallet not found' });

      const remaining = Number(conv.amountSource) * 0.5;
      const newAvailable = Number(wallet.availableBalance) + remaining;

      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: newAvailable.toString(),
          tierStatus: 'FULL'
        }
      });

      await prisma.transaction.create({
        data: {
          walletId: wallet.id,
          amount: remaining,
          currency: conv.sourceCurrency,
          type: 'UNLOCK',
          metadata: { conversionRequestId: conv.id }
        }
      });
    }

    res.json({ ok: true, conv });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
