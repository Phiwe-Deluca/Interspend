const prisma = require('../db');

async function getWalletForUser(userId) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 50
      }
    }
  });
  return wallet;
}

/**
 * Apply an NFC payment for a user.
 * Priority: consume reservedBalance first, then availableBalance.
 * Throws an Error('Insufficient funds') if total < amount.
 */
async function applyNfcPayment(userId, amount) {
  if (typeof amount !== 'number' || amount <= 0) throw new Error('Invalid amount');

  // Use a transaction to avoid race conditions
  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new Error('Wallet not found');

    const reserved = Number(wallet.reservedBalance);
    const available = Number(wallet.availableBalance);
    const total = reserved + available;

    if (total < amount) throw new Error('Insufficient funds');

    let remaining = amount;
    let usedReserved = 0;
    let usedAvailable = 0;

    // consume reserved first
    if (reserved >= remaining) {
      usedReserved = remaining;
      remaining = 0;
    } else {
      usedReserved = reserved;
      remaining -= reserved;
    }

    if (remaining > 0) {
      usedAvailable = remaining;
      remaining = 0;
    }

    const newReserved = (reserved - usedReserved).toFixed(2);
    const newAvailable = (available - usedAvailable).toFixed(2);

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        reservedBalance: newReserved,
        availableBalance: newAvailable
      }
    });

    const txRecord = await tx.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        currency: wallet.currency,
        type: 'NFC_PAYMENT',
        metadata: {
          usedReserved,
          usedAvailable
        }
      }
    });

    return txRecord;
  });
}

module.exports = {
  getWalletForUser,
  applyNfcPayment
};
