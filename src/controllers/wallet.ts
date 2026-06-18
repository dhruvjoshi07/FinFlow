import { Router, Response } from 'express';
import { prisma } from '../services/db';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { createLedgerEntries } from '../services/ledger';

const router = Router();

// Create a new wallet in a specific currency
router.post('/create', authenticateJWT as any, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { currency } = req.body;

    const allowedCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY'];
    if (!currency || !allowedCurrencies.includes(currency.toUpperCase())) {
      return res.status(400).json({ error: `Invalid currency. Allowed currencies: ${allowedCurrencies.join(', ')}` });
    }

    const cur = currency.toUpperCase();

    // Check if user already has a wallet for this currency
    const existingWallet = await prisma.wallet.findFirst({
      where: {
        userId: req.user.id,
        currency: cur,
      },
    });

    if (existingWallet) {
      return res.status(400).json({ error: `You already have a ${cur} wallet.` });
    }

    const newWallet = await prisma.wallet.create({
      data: {
        userId: req.user.id,
        currency: cur,
        balance: 0.0,
        status: 'ACTIVE',
      },
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: `WALLET_CREATED_${cur}`,
        ipAddress: req.ip,
      },
    });

    res.status(201).json({ message: 'Wallet created successfully', wallet: newWallet });
  } catch (error) {
    console.error('Create wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all wallets for the authenticated user
router.get('/list', authenticateJWT as any, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const wallets = await prisma.wallet.findMany({
      where: { userId: req.user.id },
      orderBy: { currency: 'asc' },
    });

    res.json(wallets);
  } catch (error) {
    console.error('List wallets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deposit simulation (adding funds to a wallet)
router.post('/deposit', authenticateJWT as any, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { walletId, amount } = req.body;

    if (!walletId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Wallet ID and a positive amount are required' });
    }

    // Verify wallet ownership
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, userId: req.user.id },
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found or access denied' });
    }

    if (wallet.status === 'FROZEN') {
      return res.status(400).json({ error: 'Wallet is frozen. Cannot perform operations.' });
    }

    // Atomic transaction: update wallet balance, create transaction record, and ledger entries
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: walletId },
        data: { balance: wallet.balance + Number(amount) },
      });

      // 2. Create deposit transaction
      const transaction = await tx.transaction.create({
        data: {
          senderWalletId: null,
          receiverWalletId: walletId,
          amount: Number(amount),
          currency: wallet.currency,
          exchangeRate: 1.0,
          convertedAmount: Number(amount),
          fee: 0.0,
          status: 'COMPLETED',
        },
      });

      // 3. Create double-entry ledger entries (external deposit: credit only, no sender debit)
      await createLedgerEntries({
        transactionId: transaction.id,
        senderWalletId: null,
        receiverWalletId: walletId,
        amount: Number(amount),
        convertedAmount: Number(amount),
        fee: 0.0,
      }, tx);

      return { wallet: updatedWallet, transaction };
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: `WALLET_DEPOSIT_${wallet.currency}_${amount}`,
        ipAddress: req.ip,
      },
    });

    res.json({
      message: 'Deposit successful',
      wallet: result.wallet,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
