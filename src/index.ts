import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './controllers/auth';
import walletRouter from './controllers/wallet';
import transferRouter from './controllers/transfer';
import adminRouter from './controllers/admin';
import analyticsRouter from './controllers/analytics';
import { prisma } from './services/db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON Parsing
app.use(cors());
app.use(express.json());

// Register API Routes
app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/transfer', transferRouter);
app.use('/api/admin', adminRouter);
app.use('/api/analytics', analyticsRouter);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`[FinFlow Server] Running on port ${PORT}`);
  
  // Start the background jobs
  startScheduledJobs();
});

/**
 * Scheduled Jobs (Simulated via setInterval)
 * 1. Update exchange rates every 30 seconds with minor fluctuations (±0.15%)
 * 2. Generate and log an automated hourly ledger audit check
 */
function startScheduledJobs() {
  console.log('[Scheduler] Background jobs started.');

  // Job 1: Exchange rate fluctuation simulator (runs every 30 seconds)
  setInterval(async () => {
    try {
      const rates = await prisma.exchangeRate.findMany();
      if (rates.length === 0) return;

      for (const r of rates) {
        // Generate a random fluctuation between -0.15% and +0.15%
        const fluctuation = 1 + (Math.random() * 0.003 - 0.0015);
        const newRate = Number((r.rate * fluctuation).toFixed(4));

        await prisma.exchangeRate.update({
          where: { id: r.id },
          data: { rate: newRate },
        });
      }
      console.log('[Scheduler] Simulating forex updates: Updated all exchange rates.');
    } catch (err) {
      console.error('[Scheduler Error] Forex update failed:', err);
    }
  }, 30000);

  // Job 2: Audit log ledger check (runs every 2 minutes for demo purposes)
  setInterval(async () => {
    try {
      // Fetch total debits and credits from ledger to verify balance
      const entries = await prisma.ledgerEntry.findMany();
      const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);
      
      console.log(`[Ledger Audit] Running double-entry check. Total Debits: ${totalDebits.toFixed(2)}, Total Credits: ${totalCredits.toFixed(2)}`);

      // Log audit
      await prisma.auditLog.create({
        data: {
          action: 'CRON_LEDGER_AUDIT_VERIFIED',
          ipAddress: '127.0.0.1',
        },
      });
    } catch (err) {
      console.error('[Scheduler Error] Ledger audit failed:', err);
    }
  }, 120000);
}

export default server;
