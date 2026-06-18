import { Router, Response } from 'express';
import { prisma } from '../services/db';
import { authenticateJWT, requireRole, AuthRequest } from '../middleware/auth';
import { createLedgerEntries } from '../services/ledger';

const router = Router();

// Apply admin access middleware to all endpoints in this router
router.use(authenticateJWT as any);
router.use(requireRole('ADMIN') as any);

// 1. Get KYC Pending Users
router.get('/kyc/pending', async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { kycStatus: 'PENDING' },
      select: { id: true, name: true, email: true, kycStatus: true, createdAt: true },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Approve/Reject KYC
router.post('/kyc/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { userId, status } = req.body; // status = APPROVED or REJECTED

    if (!userId || !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'User ID and valid status (APPROVED/REJECTED) are required' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { kycStatus: status },
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: `ADMIN_KYC_${status}_FOR_${userId}`,
        ipAddress: req.ip,
      },
    });

    res.json({ message: `KYC updated to ${status} for user ${updatedUser.name}`, user: updatedUser });
  } catch (error) {
    console.error('KYC update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Freeze / Unfreeze a Wallet
router.post('/wallet/freeze', async (req: AuthRequest, res: Response) => {
  try {
    const { walletId, action } = req.body; // action = FREEZE or UNFREEZE

    if (!walletId || !['FREEZE', 'UNFREEZE'].includes(action)) {
      return res.status(400).json({ error: 'Wallet ID and valid action (FREEZE/UNFREEZE) are required' });
    }

    const statusValue = action === 'FREEZE' ? 'FROZEN' : 'ACTIVE';

    const wallet = await prisma.wallet.update({
      where: { id: walletId },
      data: { status: statusValue },
      include: { user: { select: { name: true } } },
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: `ADMIN_WALLET_${action}_FOR_${walletId}`,
        ipAddress: req.ip,
      },
    });

    res.json({ message: `Wallet ${walletId} (${wallet.currency}) for user ${wallet.user.name} is now ${statusValue}`, wallet });
  } catch (error) {
    console.error('Wallet freeze error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. View all Fraud Alerts
router.get('/fraud/alerts', async (req: AuthRequest, res: Response) => {
  try {
    const alerts = await prisma.fraudAlert.findMany({
      include: {
        transaction: {
          include: {
            senderWallet: { include: { user: { select: { name: true, email: true } } } },
            receiverWallet: { include: { user: { select: { name: true, email: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Resolve Fraud Alert (Release or Cancel Flagged transaction)
router.post('/fraud/resolve', async (req: AuthRequest, res: Response) => {
  try {
    const { alertId, action } = req.body; // action = RELEASE or CANCEL

    if (!alertId || !['RELEASE', 'CANCEL'].includes(action)) {
      return res.status(400).json({ error: 'Alert ID and valid action (RELEASE/CANCEL) are required' });
    }

    const alert = await prisma.fraudAlert.findUnique({
      where: { id: alertId },
      include: { transaction: true },
    });

    if (!alert) {
      return res.status(404).json({ error: 'Fraud alert not found' });
    }

    if (alert.status !== 'NEW') {
      return res.status(400).json({ error: 'Alert is already resolved' });
    }

    const txId = alert.transactionId;
    const transaction = alert.transaction;

    if (action === 'RELEASE') {
      if (transaction.status !== 'FLAGGED') {
        return res.status(400).json({ error: `Cannot release a transaction in state: ${transaction.status}` });
      }

      // Check balances and process transfer atomically
      const result = await prisma.$transaction(async (tx) => {
        // Fetch wallets to make sure they are valid
        const senderWallet = await tx.wallet.findUnique({ where: { id: transaction.senderWalletId! } });
        const receiverWallet = await tx.wallet.findUnique({ where: { id: transaction.receiverWalletId } });

        if (!senderWallet || !receiverWallet) {
          throw new Error('Wallets linked to this transaction no longer exist');
        }

        const totalDebit = transaction.amount + transaction.fee;

        if (senderWallet.balance < totalDebit) {
          throw new Error(`Insufficient funds in sender wallet. Required: ${totalDebit}, Available: ${senderWallet.balance}`);
        }

        // Debit sender
        await tx.wallet.update({
          where: { id: senderWallet.id },
          data: { balance: { decrement: totalDebit } },
        });

        // Credit receiver
        await tx.wallet.update({
          where: { id: receiverWallet.id },
          data: { balance: { increment: transaction.convertedAmount } },
        });

        // Update transaction status
        const updatedTx = await tx.transaction.update({
          where: { id: txId },
          data: { status: 'COMPLETED' },
        });

        // Update fraud alert status
        await tx.fraudAlert.update({
          where: { id: alertId },
          data: { status: 'RESOLVED_RELEASED' },
        });

        // Write double-entry ledger records
        await createLedgerEntries({
          transactionId: txId,
          senderWalletId: senderWallet.id,
          receiverWalletId: receiverWallet.id,
          amount: transaction.amount,
          convertedAmount: transaction.convertedAmount,
          fee: transaction.fee,
        }, tx);

        return updatedTx;
      });

      // Write Audit Log
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: `ADMIN_RELEASED_FLAGGED_TX_${txId}`,
          ipAddress: req.ip,
        },
      });

      return res.json({ message: 'Transaction released and processed successfully', transaction: result });
    } else {
      // action === 'CANCEL'
      const updatedTx = await prisma.$transaction(async (tx) => {
        // Update transaction status to FAILED
        const t = await tx.transaction.update({
          where: { id: txId },
          data: { status: 'FAILED' },
        });

        // Update fraud alert status
        await tx.fraudAlert.update({
          where: { id: alertId },
          data: { status: 'RESOLVED_CANCELLED' },
        });

        return t;
      });

      // Write Audit Log
      await prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action: `ADMIN_CANCELLED_FLAGGED_TX_${txId}`,
          ipAddress: req.ip,
        },
      });

      return res.json({ message: 'Transaction cancelled successfully', transaction: updatedTx });
    }
  } catch (error: any) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// 6. Update Exchange Rate
router.post('/exchange-rate', async (req: AuthRequest, res: Response) => {
  try {
    const { fromCurrency, toCurrency, rate } = req.body;

    if (!fromCurrency || !toCurrency || !rate || rate <= 0) {
      return res.status(400).json({ error: 'From, To currencies and a positive rate are required' });
    }

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    const rateRecord = await prisma.exchangeRate.upsert({
      where: {
        currencyFrom_currencyTo: {
          currencyFrom: from,
          currencyTo: to,
        },
      },
      update: { rate: Number(rate) },
      create: {
        currencyFrom: from,
        currencyTo: to,
        rate: Number(rate),
      },
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: `ADMIN_UPDATED_RATE_${from}_${to}_TO_${rate}`,
        ipAddress: req.ip,
      },
    });

    res.json({ message: `Exchange rate ${from} -> ${to} updated to ${rate}`, rate: rateRecord });
  } catch (error) {
    console.error('Exchange rate update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
