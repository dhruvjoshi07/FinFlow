import { prisma } from './db';

interface RiskAnalysisInput {
  senderWalletId?: string | null;
  receiverWalletId: string;
  amount: number;         // Amount in sender's currency
  currency: string;       // Sender's currency
  receiverCurrency: string; // Receiver's currency
}

interface RiskAnalysisResult {
  riskScore: number;
  reasons: string[];
  isFlagged: boolean;
}

/**
 * Analyzes transaction risk score based on business rules:
 * 1. Large transaction (amount > 100,000 INR equivalent, ~1,200 USD/EUR)
 * 2. Rapid transactions (velocity check: > 3 transactions in the last 10 minutes)
 * 3. Cross-Border mismatch (different currencies / international transfer)
 */
export async function analyzeTransactionRisk(input: RiskAnalysisInput): Promise<RiskAnalysisResult> {
  let riskScore = 0;
  const reasons: string[] = [];

  const { senderWalletId, receiverWalletId, amount, currency, receiverCurrency } = input;

  // 1. Large Transaction Check
  // Let's convert the amount to a common denominator (e.g. USD) for rules checking.
  // We'll use approximate conversion rates: 1 USD = 83 INR, 1 EUR = 1.08 USD, etc.
  let amountInUSD = amount;
  if (currency === 'INR') {
    amountInUSD = amount / 83;
  } else if (currency === 'EUR') {
    amountInUSD = amount * 1.08;
  } else if (currency === 'GBP') {
    amountInUSD = amount * 1.27;
  } else if (currency === 'JPY') {
    amountInUSD = amount / 155;
  }

  // Threshold for large transaction: $1,200 USD (~100,000 INR)
  if (amountInUSD > 1200) {
    riskScore += 40;
    reasons.push(`Large transaction size: $${amountInUSD.toFixed(2)} USD (exceeds $1200 threshold)`);
  }

  // 2. Cross-Border / Currency Mismatch
  if (currency !== receiverCurrency) {
    riskScore += 25;
    reasons.push(`Cross-border currency mismatch: ${currency} to ${receiverCurrency}`);
  }

  // 3. Velocity Check (Rapid Transactions)
  if (senderWalletId) {
    // Check how many transactions sender has completed in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentTxCount = await prisma.transaction.count({
      where: {
        senderWalletId,
        createdAt: {
          gte: fiveMinutesAgo,
        },
      },
    });

    if (recentTxCount >= 3) {
      riskScore += 30;
      reasons.push(`Velocity alert: ${recentTxCount} transfers sent in the last 5 minutes`);
    }
  }

  // Limit risk score to 100
  riskScore = Math.min(riskScore, 100);
  const isFlagged = riskScore >= 65;

  return {
    riskScore,
    reasons,
    isFlagged,
  };
}

/**
 * Creates a fraud alert in the database for flagged transactions
 */
export async function createFraudAlert(transactionId: string, riskScore: number, reasons: string[]) {
  return prisma.fraudAlert.create({
    data: {
      transactionId,
      riskScore,
      reason: reasons.join('; '),
      status: 'NEW',
    },
  });
}
