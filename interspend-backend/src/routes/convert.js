const express = require('express');
const prisma = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

function getMockRate(from, to) {
  if (from === to) return 1;

  const base = {
    ZAR: { USD: 0.056, EUR: 0.051, ZIG: 1.64 }
  };

  if (base[from] && base[from][to] != null) return base[from][to];

  if (base[to] && base[to][from] != null) return 1 / base[to][from];

  return 1;
}

// POST /api/convert
router.post('/convert', auth, async (req, res) => {
  try {
    const { source, target, amount } = req.body;
    if (!source || !target || amount == null) return res.status(400).json({ error: 'Missing fields' });

    const amtSource = Number(amount);
    if (!isFinite(amtSource) || amtSource <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const rate = getMockRate(source, target);
    const amountTarget = amtSource * rate;

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(500).json({ error: 'User wallet not found' });

    const partialReserve = amtSource * 0.5;

    const available = Number(wallet.availableBalance) || 0;
    let newAvailable = available;
    let newReserved = Number(wallet.reservedBalance) || 0;

    if (available >= partialReserve) {
      newAvailable = available - partialReserve;
      newReserved = newReserved + partialReserve;
    } else {
      newAvailable = 0;
      newReserved = newReserved + partialReserve;
    }

    const conv = await prisma.conversionRequest.create({
      data: {
        userId: req.user.id,
        sourceCurrency: source,
        targetCurrency: target,
        amountSource: amtSource.toString(),
        amountTargetEst: amountTarget.toString(),
        status: 'PENDING'
      }
    });

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
        amount: partialReserve.toString(),
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

      const remaining = Number(conv.amountSource || 0) * 0.5;
      const newAvailable = (Number(wallet.availableBalance) || 0) + remaining;
      const newReserved = Math.max((Number(wallet.reservedBalance) || 0) - remaining, 0);

      await prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: newAvailable.toString(),
          reservedBalance: newReserved.toString(),
          tierStatus: 'FULL'
        }
      });

      await prisma.transaction.create({
        data: {
          walletId: wallet.id,
          amount: remaining.toString(),
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