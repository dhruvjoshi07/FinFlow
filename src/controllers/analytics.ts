import { Router, Response } from 'express';
import { prisma } from '../services/db';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

// Approximate conversion rates to USD for analytics aggregation
function convertToUSD(amount: number, currency: string): number {
  const cur = currency.toUpperCase();
  if (cur === 'USD') return amount;
  if (cur === 'INR') return amount / 83.0;
  if (cur === 'EUR') return amount * 1.08;
  if (cur === 'GBP') return amount * 1.27;
  if (cur === 'JPY') return amount / 155.0;
  return amount; // default 1:1 if unknown
}

router.get('/dashboard', authenticateJWT as any, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = req.user.role === 'ADMIN';

    // 1. Fetch Transactions
    // If Admin: fetch all. If User: fetch only transactions involving their wallets.
    let transactions;
    if (isAdmin) {
      transactions = await prisma.transaction.findMany({
        include: {
          senderWallet: { include: { user: { select: { name: true } } } },
          receiverWallet: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      const userWallets = await prisma.wallet.findMany({
        where: { userId: req.user.id },
        select: { id: true },
      });
      const walletIds = userWallets.map(w => w.id);

      transactions = await prisma.transaction.findMany({
        where: {
          OR: [
            { senderWalletId: { in: walletIds } },
            { receiverWalletId: { in: walletIds } },
          ],
        },
        include: {
          senderWallet: { include: { user: { select: { name: true } } } },
          receiverWallet: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Calculate KPIs in Memory (to remain database-agnostic and work flawlessly with SQLite fallback)
    let totalVolumeUSD = 0;
    let totalRevenueUSD = 0;
    let completedTxCount = 0;
    let flaggedTxCount = 0;
    let failedTxCount = 0;

    const dailyTrends: Record<string, { date: string; volumeUSD: number; count: number }> = {};
    const currencyBreakdown: Record<string, number> = {};

    transactions.forEach((tx) => {
      const txVolumeUSD = convertToUSD(tx.amount, tx.currency);
      const txFeeUSD = convertToUSD(tx.fee, tx.currency);

      if (tx.status === 'COMPLETED') {
        totalVolumeUSD += txVolumeUSD;
        totalRevenueUSD += txFeeUSD;
        completedTxCount++;

        // Currency Breakdown
        currencyBreakdown[tx.currency] = (currencyBreakdown[tx.currency] || 0) + txVolumeUSD;
      } else if (tx.status === 'FLAGGED') {
        flaggedTxCount++;
      } else if (tx.status === 'FAILED') {
        failedTxCount++;
      }

      // Daily Trends Grouping
      const dateStr = tx.createdAt.toISOString().split('T')[0];
      if (!dailyTrends[dateStr]) {
        dailyTrends[dateStr] = { date: dateStr, volumeUSD: 0, count: 0 };
      }
      if (tx.status === 'COMPLETED') {
        dailyTrends[dateStr].volumeUSD += txVolumeUSD;
        dailyTrends[dateStr].count += 1;
      }
    });

    // Format daily trends list sorted by date
    const trendData = Object.values(dailyTrends).sort((a, b) => a.date.localeCompare(b.date));

    // Format top currencies sorted by volume
    const currencyData = Object.entries(currencyBreakdown).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2)),
    })).sort((a, b) => b.value - a.value);

    // Fraud metrics
    const totalTx = transactions.length;
    const fraudPercentage = totalTx > 0 ? Number(((flaggedTxCount / totalTx) * 100).toFixed(1)) : 0;

    // Fetch Audit Logs (Admin gets all, User gets their own)
    let auditLogs;
    if (isAdmin) {
      auditLogs = await prisma.auditLog.findMany({
        include: { user: { select: { name: true, email: true } } },
        orderBy: { timestamp: 'desc' },
        take: 15,
      });
    } else {
      auditLogs = await prisma.auditLog.findMany({
        where: { userId: req.user.id },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });
    }

    // Fetch User Wallets Summary
    const userWallets = await prisma.wallet.findMany({
      where: isAdmin ? undefined : { userId: req.user.id },
      include: { user: { select: { name: true, email: true } } },
    });

    res.json({
      summary: {
        totalVolumeUSD: Number(totalVolumeUSD.toFixed(2)),
        totalRevenueUSD: Number(totalRevenueUSD.toFixed(2)),
        completedTxCount,
        flaggedTxCount,
        failedTxCount,
        totalTx,
        fraudPercentage,
      },
      dailyTrends: trendData,
      currencyBreakdown: currencyData,
      auditLogs,
      wallets: userWallets.map(w => ({
        id: w.id,
        userEmail: w.user.email,
        userName: w.user.name,
        currency: w.currency,
        balance: w.balance,
        status: w.status,
      })),
    });
  } catch (error) {
    console.error('Fetch analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
