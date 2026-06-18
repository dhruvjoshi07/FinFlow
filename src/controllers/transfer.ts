import { Router, Response } from 'express';
import { prisma } from '../services/db';
import { authenticateJWT, AuthRequest } from '../middleware/auth';
import { createLedgerEntries } from '../services/ledger';
import { analyzeTransactionRisk, createFraudAlert } from '../services/fraud';

const router = Router();

// Helper to fetch live rate between two currencies
async function getExchangeRate(from: string, to: string): Promise<number> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1.0;

  const rateRow = await prisma.exchangeRate.findUnique({
    where: {
      currencyFrom_currencyTo: {
        currencyFrom: f,
        currencyTo: t,
      },
    },
  });

  if (rateRow) return rateRow.rate;

  // Fallback rates in case DB is not seeded yet
  const fallbacks: Record<string, number> = {
    'USD_INR': 83.15, 'INR_USD': 0.012,
    'USD_EUR': 0.92, 'EUR_USD': 1.09,
    'USD_GBP': 0.79, 'GBP_USD': 1.27,
    'USD_JPY': 155.40, 'JPY_USD': 0.0064,
    'EUR_INR': 90.10, 'INR_EUR': 0.011,
    'GBP_INR': 105.30, 'INR_GBP': 0.0095,
    'EUR_GBP': 0.86, 'GBP_EUR': 1.16,
    'EUR_JPY': 168.20, 'JPY_EUR': 0.0059,
    'GBP_JPY': 196.40, 'JPY_GBP': 0.0051,
  };

  const key = `${f}_${t}`;
  return fallbacks[key] || 1.0;
}

// 1. Get all exchange rates
router.get('/rates', async (req, res) => {
  try {
    const rates = await prisma.exchangeRate.findMany();
    res.json(rates);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Preview Conversion / Transfer details
router.post('/preview', authenticateJWT as any, async (req: AuthRequest, res: Response) => {
  try {
    const { fromCurrency, toCurrency, amount } = req.body;

    if (!fromCurrency || !toCurrency || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Missing parameters or invalid amount' });
    }

    const rate = await getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = Number((amount * rate).toFixed(2));
    
    // Fee calculation: 0.5% for domestic, 1.5% for international (currency conversion)
    const feePercent = fromCurrency.toUpperCase() === toCurrency.toUpperCase() ? 0.005 : 0.015;
    const fee = Number((amount * feePercent).toFixed(2));
    const totalCost = Number((amount + fee).toFixed(2));

    res.json({
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      amount: Number(amount),
      rate,
      convertedAmount,
      fee,
      totalCost,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Process Transfer / Payment
router.post('/send', authenticateJWT as any, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { senderWalletId, receiverEmail, amount } = req.body;

    if (!senderWalletId || !receiverEmail || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid input parameters' });
    }

    // 1. Fetch sender user profile to check KYC status
    const senderUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!senderUser) {
      return res.status(404).json({ error: 'Sender account not found' });
    }

    if (senderUser.kycStatus !== 'APPROVED') {
      return res.status(400).json({
        error: `KYC Compliance Blocked: Your KYC status is ${senderUser.kycStatus}. You must have an APPROVED status to send funds.`,
      });
    }

    // 2. Fetch sender wallet details
    const senderWallet = await prisma.wallet.findFirst({
      where: { id: senderWalletId, userId: req.user.id },
    });

    if (!senderWallet) {
      return res.status(404).json({ error: 'Sender wallet not found' });
    }

    if (senderWallet.status === 'FROZEN') {
      return res.status(400).json({ error: 'Sender wallet is frozen and cannot transact.' });
    }

    // 3. Find recipient user and wallet
    const receiverUser = await prisma.user.findUnique({
      where: { email: receiverEmail },
      include: { wallets: true },
    });

    if (!receiverUser) {
      return res.status(404).json({ error: `Recipient with email ${receiverEmail} not found` });
    }

    if (receiverUser.id === senderUser.id) {
      return res.status(400).json({ error: 'Cannot transfer money to yourself. Use conversion options instead.' });
    }

    // Determine receiver's target wallet.
    // Ideally, credit recipient's wallet of matching currency, otherwise their first wallet.
    let receiverWallet = receiverUser.wallets.find(
      (w) => w.currency === senderWallet.currency && w.status === 'ACTIVE'
    );

    if (!receiverWallet) {
      // Find any active wallet
      receiverWallet = receiverUser.wallets.find((w) => w.status === 'ACTIVE');
    }

    if (!receiverWallet) {
      return res.status(400).json({ error: 'Recipient does not have any active wallets' });
    }

    // 4. Calculate Rate and Fees
    const rate = await getExchangeRate(senderWallet.currency, receiverWallet.currency);
    const convertedAmount = Number((amount * rate).toFixed(2));

    const isCrossCurrency = senderWallet.currency !== receiverWallet.currency;
    const feePercent = isCrossCurrency ? 0.015 : 0.005; // 1.5% cross-currency, 0.5% same
    const fee = Number((amount * feePercent).toFixed(2));
    const totalDebitAmount = amount + fee;

    // Check balance
    if (senderWallet.balance < totalDebitAmount) {
      return res.status(400).json({
        error: `Insufficient funds. Needed: ${totalDebitAmount} ${senderWallet.currency}. Available: ${senderWallet.balance} ${senderWallet.currency}.`,
      });
    }

    // 5. Run Compliance & Fraud Detection Rules
    const riskAnalysis = await analyzeTransactionRisk({
      senderWalletId: senderWallet.id,
      receiverWalletId: receiverWallet.id,
      amount,
      currency: senderWallet.currency,
      receiverCurrency: receiverWallet.currency,
    });

    // Write Audit Log for the analysis
    await prisma.auditLog.create({
      data: {
        userId: senderUser.id,
        action: `FRAUD_CHECK_RUN_SCORE_${riskAnalysis.riskScore}`,
        ipAddress: req.ip,
      },
    });

    if (riskAnalysis.isFlagged) {
      // Flagged Transaction: Do NOT transfer funds immediately. Save as FLAGGED status.
      const transaction = await prisma.$transaction(async (tx) => {
        // Create Transaction in FLAGGED state
        const txRecord = await tx.transaction.create({
          data: {
            senderWalletId: senderWallet.id,
            receiverWalletId: receiverWallet!.id,
            amount,
            currency: senderWallet.currency,
            exchangeRate: rate,
            convertedAmount,
            fee,
            status: 'FLAGGED',
          },
        });

        // Create the Fraud Alert record linking to it
        await tx.fraudAlert.create({
          data: {
            transactionId: txRecord.id,
            riskScore: riskAnalysis.riskScore,
            reason: riskAnalysis.reasons.join('; '),
            status: 'NEW',
          },
        });

        return txRecord;
      });

      return res.status(202).json({
        message: 'Transaction flagged for compliance review. Funds have not been debited.',
        status: 'FLAGGED',
        transactionId: transaction.id,
        riskScore: riskAnalysis.riskScore,
        reasons: riskAnalysis.reasons,
      });
    }

    // 6. Clean Transaction: Process funds transfer atomically
    const completedTx = await prisma.$transaction(async (tx) => {
      // Debit Sender
      await tx.wallet.update({
        where: { id: senderWallet.id },
        data: { balance: { decrement: totalDebitAmount } },
      });

      // Credit Receiver
      await tx.wallet.update({
        where: { id: receiverWallet!.id },
        data: { balance: { increment: convertedAmount } },
      });

      // Save Transaction
      const txRecord = await tx.transaction.create({
        data: {
          senderWalletId: senderWallet.id,
          receiverWalletId: receiverWallet!.id,
          amount,
          currency: senderWallet.currency,
          exchangeRate: rate,
          convertedAmount,
          fee,
          status: 'COMPLETED',
        },
      });

      // Write Double-Entry Ledger entries
      await createLedgerEntries({
        transactionId: txRecord.id,
        senderWalletId: senderWallet.id,
        receiverWalletId: receiverWallet!.id,
        amount,
        convertedAmount,
        fee,
      }, tx);

      return txRecord;
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        userId: senderUser.id,
        action: `TRANSFER_SENT_TO_${receiverEmail}_${amount}_${senderWallet.currency}`,
        ipAddress: req.ip,
      },
    });

    res.status(200).json({
      message: 'Payment completed successfully',
      status: 'COMPLETED',
      transaction: completedTx,
    });
  } catch (error: any) {
    console.error('Transfer processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Retrieve Transaction History (Both sent and received)
router.get('/history', authenticateJWT as any, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // Find all wallets owned by this user
    const userWallets = await prisma.wallet.findMany({
      where: { userId: req.user.id },
      select: { id: true },
    });

    const walletIds = userWallets.map((w) => w.id);

    // Fetch transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { senderWalletId: { in: walletIds } },
          { receiverWalletId: { in: walletIds } },
        ],
      },
      include: {
        senderWallet: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        receiverWallet: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(transactions);
  } catch (error) {
    console.error('Fetch transaction history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
