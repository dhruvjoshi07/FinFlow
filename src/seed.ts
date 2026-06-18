import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seeding] Clearing existing data...');
  await prisma.ledgerEntry.deleteMany({});
  await prisma.fraudAlert.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.exchangeRate.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('[Seeding] Creating users...');
  
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('admin123', salt);
  const userPasswordHash = await bcrypt.hash('user123', salt);
  const alicePasswordHash = await bcrypt.hash('alice123', salt);
  const bobPasswordHash = await bcrypt.hash('bob123', salt);

  // 1. Admin User
  const admin = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'admin@finflow.com',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      kycStatus: 'APPROVED',
    },
  });

  // 2. Verified User
  const user = await prisma.user.create({
    data: {
      name: 'John Doe',
      email: 'user@finflow.com',
      passwordHash: userPasswordHash,
      role: 'USER',
      kycStatus: 'APPROVED',
    },
  });

  // 3. KYC Pending User (Alice)
  const alice = await prisma.user.create({
    data: {
      name: 'Alice Vance',
      email: 'alice@finflow.com',
      passwordHash: alicePasswordHash,
      role: 'USER',
      kycStatus: 'PENDING',
    },
  });

  // 4. Another Verified User (Bob)
  const bob = await prisma.user.create({
    data: {
      name: 'Bob Smith',
      email: 'bob@finflow.com',
      passwordHash: bobPasswordHash,
      role: 'USER',
      kycStatus: 'APPROVED',
    },
  });

  console.log('[Seeding] Creating wallets...');
  
  // Admin wallets
  await prisma.wallet.createMany({
    data: [
      { userId: admin.id, currency: 'USD', balance: 500000.0, status: 'ACTIVE' },
      { userId: admin.id, currency: 'INR', balance: 10000000.0, status: 'ACTIVE' },
    ],
  });

  // John Doe (user@finflow.com) wallets
  const johnUsdWallet = await prisma.wallet.create({
    data: { userId: user.id, currency: 'USD', balance: 5000.0, status: 'ACTIVE' },
  });
  const johnInrWallet = await prisma.wallet.create({
    data: { userId: user.id, currency: 'INR', balance: 250000.0, status: 'ACTIVE' },
  });

  // Alice Vance (alice@finflow.com) wallets
  await prisma.wallet.createMany({
    data: [
      { userId: alice.id, currency: 'USD', balance: 100.0, status: 'ACTIVE' },
    ],
  });

  // Bob Smith (bob@finflow.com) wallets
  const bobUsdWallet = await prisma.wallet.create({
    data: { userId: bob.id, currency: 'USD', balance: 3500.0, status: 'ACTIVE' },
  });
  const bobEurWallet = await prisma.wallet.create({
    data: { userId: bob.id, currency: 'EUR', balance: 2000.0, status: 'ACTIVE' },
  });

  console.log('[Seeding] Creating default exchange rates...');
  
  const exchangeRates = [
    { currencyFrom: 'USD', currencyTo: 'INR', rate: 83.15 },
    { currencyFrom: 'INR', currencyTo: 'USD', rate: 0.012 },
    { currencyFrom: 'USD', currencyTo: 'EUR', rate: 0.92 },
    { currencyFrom: 'EUR', currencyTo: 'USD', rate: 1.09 },
    { currencyFrom: 'USD', currencyTo: 'GBP', rate: 0.79 },
    { currencyFrom: 'GBP', currencyTo: 'USD', rate: 1.27 },
    { currencyFrom: 'USD', currencyTo: 'JPY', rate: 155.40 },
    { currencyFrom: 'JPY', currencyTo: 'USD', rate: 0.0064 },
    { currencyFrom: 'EUR', currencyTo: 'INR', rate: 90.10 },
    { currencyFrom: 'INR', currencyTo: 'EUR', rate: 0.011 },
    { currencyFrom: 'GBP', currencyTo: 'INR', rate: 105.30 },
    { currencyFrom: 'INR', currencyTo: 'GBP', rate: 0.0095 },
    { currencyFrom: 'EUR', currencyTo: 'GBP', rate: 0.86 },
    { currencyFrom: 'GBP', currencyTo: 'EUR', rate: 1.16 },
    { currencyFrom: 'EUR', currencyTo: 'JPY', rate: 168.20 },
    { currencyFrom: 'JPY', currencyTo: 'EUR', rate: 0.0059 },
    { currencyFrom: 'GBP', currencyTo: 'JPY', rate: 196.40 },
    { currencyFrom: 'JPY', currencyTo: 'GBP', rate: 0.0051 },
  ];

  for (const rate of exchangeRates) {
    await prisma.exchangeRate.create({
      data: rate,
    });
  }

  console.log('[Seeding] Simulating some initial completed payments...');
  
  // Let's create an initial history of 3 transactions to populate analytics immediately
  // Tx 1: John sends Bob $500
  const tx1 = await prisma.transaction.create({
    data: {
      senderWalletId: johnUsdWallet.id,
      receiverWalletId: bobUsdWallet.id,
      amount: 500,
      currency: 'USD',
      exchangeRate: 1.0,
      convertedAmount: 500,
      fee: 2.50, // 0.5% same-currency fee
      status: 'COMPLETED',
      createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000), // 36 hours ago
    },
  });
  
  // Subtract from John, add to Bob (without full transaction middleware since we are just seeding history)
  await prisma.wallet.update({ where: { id: johnUsdWallet.id }, data: { balance: 4497.50 } });
  await prisma.wallet.update({ where: { id: bobUsdWallet.id }, data: { balance: 4000.00 } });

  // Ledger for Tx 1
  await prisma.ledgerEntry.createMany({
    data: [
      { transactionId: tx1.id, walletId: johnUsdWallet.id, debit: 502.50, credit: 0.0, createdAt: tx1.createdAt },
      { transactionId: tx1.id, walletId: bobUsdWallet.id, debit: 0.0, credit: 500.0, createdAt: tx1.createdAt },
      { transactionId: tx1.id, walletId: 'SYSTEM_FEE_WALLET', debit: 0.0, credit: 2.50, createdAt: tx1.createdAt },
    ],
  });

  // Tx 2: John sends Bob EUR 1,000 equivalent from his INR wallet
  // INR balance: 250,000. We transfer 90,100 INR (approx 1000 EUR)
  const tx2 = await prisma.transaction.create({
    data: {
      senderWalletId: johnInrWallet.id,
      receiverWalletId: bobEurWallet.id,
      amount: 90100,
      currency: 'INR',
      exchangeRate: 0.011, // INR to EUR
      convertedAmount: 991.10,
      fee: 1351.50, // 1.5% cross-currency fee
      status: 'COMPLETED',
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
    },
  });

  await prisma.wallet.update({ where: { id: johnInrWallet.id }, data: { balance: 158548.50 } });
  await prisma.wallet.update({ where: { id: bobEurWallet.id }, data: { balance: 2991.10 } });

  // Ledger for Tx 2
  await prisma.ledgerEntry.createMany({
    data: [
      { transactionId: tx2.id, walletId: johnInrWallet.id, debit: 91451.50, credit: 0.0, createdAt: tx2.createdAt },
      { transactionId: tx2.id, walletId: bobEurWallet.id, debit: 0.0, credit: 991.10, createdAt: tx2.createdAt },
      { transactionId: tx2.id, walletId: 'SYSTEM_FEE_WALLET', debit: 0.0, credit: 1351.50, createdAt: tx2.createdAt },
    ],
  });

  console.log('[Seeding] Seeding audit logs...');
  await prisma.auditLog.createMany({
    data: [
      { action: 'SYSTEM_BOOTSTRAP', timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      { userId: admin.id, action: 'ADMIN_LOGIN', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      { userId: user.id, action: 'USER_LOGIN', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) },
    ],
  });

  console.log('[Seeding] Database seeding complete! Credentials:');
  console.log(' - Admin: admin@finflow.com / admin123');
  console.log(' - User (Verified): user@finflow.com / user123');
  console.log(' - User (Unverified): alice@finflow.com / alice123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
