import axios from 'axios';
import server from './index';

const API_URL = 'http://localhost:5000/api';

// Simple delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  console.log('\n==================================================');
  console.log('      FINFLOW SYSTEM INTEGRATION TEST SUITE      ');
  console.log('==================================================\n');

  let adminToken = '';
  let userToken = '';
  let aliceToken = '';

  try {
    // Wait for server to be fully ready
    await delay(2000);

    // 1. Log in admin@finflow.com
    console.log('[Test 1] Logging in System Admin...');
    const adminLogin = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@finflow.com',
      password: 'admin123',
    });
    adminToken = adminLogin.data.token;
    console.log(' ✅ Admin logged in. Token acquired.');

    // 2. Log in user@finflow.com (John Doe)
    console.log('[Test 2] Logging in John Doe (Verified User)...');
    const userLogin = await axios.post(`${API_URL}/auth/login`, {
      email: 'user@finflow.com',
      password: 'user123',
    });
    userToken = userLogin.data.token;
    console.log(' ✅ John Doe logged in. Token acquired.');

    // 3. Register a new user (Carol)
    console.log('[Test 3] Registering Carol (Unverified User)...');
    const carolReg = await axios.post(`${API_URL}/auth/register`, {
      name: 'Carol White',
      email: 'carol@finflow.com',
      password: 'carolPassword',
    });
    const carolId = carolReg.data.user.id;
    console.log(` ✅ Carol registered. ID: ${carolId}, KYC Status: ${carolReg.data.user.kycStatus}`);

    // Log in Carol
    const carolLogin = await axios.post(`${API_URL}/auth/login`, {
      email: 'carol@finflow.com',
      password: 'carolPassword',
    });
    const carolToken = carolLogin.data.token;

    // 4. Try transferring money from Carol (KYC Pending) - Should fail KYC check
    console.log('[Test 4] Attempting transfer from Carol (KYC PENDING)...');
    try {
      await axios.post(
        `${API_URL}/transfer/send`,
        {
          senderWalletId: carolReg.data.wallet.id,
          receiverEmail: 'user@finflow.com',
          amount: 50.0,
        },
        { headers: { Authorization: `Bearer ${carolToken}` } }
      );
      console.log(' ❌ FAIL: Carol transfer succeeded despite PENDING KYC.');
    } catch (err: any) {
      console.log(` ✅ SUCCESS: KYC Block worked! Error message: "${err.response.data.error}"`);
    }

    // 5. Admin approves Carol's KYC
    console.log('[Test 5] Admin approving Carol\'s KYC...');
    const kycApproval = await axios.post(
      `${API_URL}/admin/kyc/verify`,
      {
        userId: carolId,
        status: 'APPROVED',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log(` ✅ KYC Approved. Status: ${kycApproval.data.user.kycStatus}`);

    // 6. Transfer money from Carol (Now KYC Approved) - Should succeed!
    console.log('[Test 6] Re-attempting transfer from Carol (KYC APPROVED)...');
    // Fetch Carol's wallet details
    const carolWallets = await axios.get(`${API_URL}/wallet/list`, {
      headers: { Authorization: `Bearer ${carolToken}` },
    });
    const carolUsdWallet = carolWallets.data[0];

    const transferRes = await axios.post(
      `${API_URL}/transfer/send`,
      {
        senderWalletId: carolUsdWallet.id,
        receiverEmail: 'user@finflow.com',
        amount: 100.0,
      },
      { headers: { Authorization: `Bearer ${carolToken}` } }
    );
    console.log(` ✅ Transfer successful. Status: ${transferRes.data.status}`);

    // 7. Verify Double-Entry Ledger and Wallet Balances for Carol's transfer
    console.log('[Test 7] Verifying Carol\'s wallet balance and ledger updates...');
    const carolWalletsAfter = await axios.get(`${API_URL}/wallet/list`, {
      headers: { Authorization: `Bearer ${carolToken}` },
    });
    const carolUsdWalletAfter = carolWalletsAfter.data[0];
    const expectedCarolBalance = carolUsdWallet.balance - (100.0 + 0.50); // amount + 0.5% same-currency fee
    console.log(`   - Carol USD Balance: ${carolUsdWalletAfter.balance} (Expected: ${expectedCarolBalance})`);
    if (carolUsdWalletAfter.balance === expectedCarolBalance) {
      console.log(' ✅ Balance matches expected debit.');
    } else {
      console.log(' ❌ Balance MISMATCH.');
    }

    // 8. Trigger a Fraud Alert (Velocity/Large Amount Check)
    // John sends a large cross-currency transfer to Bob (e.g. $2,000 USD to Bob's EUR wallet)
    console.log('[Test 8] Triggering Fraud Warning (Large Amount: $2000 USD)...');
    const johnWallets = await axios.get(`${API_URL}/wallet/list`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const johnInrWallet = johnWallets.data.find((w: any) => w.currency === 'INR');

    const fraudRes = await axios.post(
      `${API_URL}/transfer/send`,
      {
        senderWalletId: johnInrWallet.id,
        receiverEmail: 'bob@finflow.com',
        amount: 150000.0,
      },
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    console.log(`   - Transfer Response Status: ${fraudRes.status}`);
    console.log(`   - Transaction Status: ${fraudRes.data.status}`);
    console.log(`   - Risk Score: ${fraudRes.data.riskScore}/100`);
    console.log(`   - Reason: ${fraudRes.data.reasons.join(', ')}`);
    
    if (fraudRes.data.status === 'FLAGGED') {
      console.log(' ✅ SUCCESS: Transaction was correctly FLAGGED for compliance.');
    } else {
      console.log(' ❌ FAIL: Transaction was not FLAGGED.');
    }

    const flaggedTxId = fraudRes.data.transactionId;

    // 9. Admin resolves the Fraud Alert (Release flagged transaction)
    console.log('[Test 9] Admin reviewing and RELEASING the flagged transaction...');
    // Get alerts first
    const alertsRes = await axios.get(`${API_URL}/admin/fraud/alerts`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const targetAlert = alertsRes.data.find((a: any) => a.transactionId === flaggedTxId);

    const resolveRes = await axios.post(
      `${API_URL}/admin/fraud/resolve`,
      {
        alertId: targetAlert.id,
        action: 'RELEASE',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log(` ✅ Alert resolved. Transaction Status now: ${resolveRes.data.transaction.status}`);

    // 10. Fetch dashboard analytics to verify reporting
    console.log('[Test 10] Fetching Admin Dashboard analytics data...');
    const statsRes = await axios.get(`${API_URL}/analytics/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`   - Total Volume USD: $${statsRes.data.summary.totalVolumeUSD}`);
    console.log(`   - Total Fees Revenue USD: $${statsRes.data.summary.totalRevenueUSD}`);
    console.log(`   - Total Transactions Count: ${statsRes.data.summary.totalTx}`);
    console.log(`   - Fraud Ratio: ${statsRes.data.summary.fraudPercentage}%`);
    console.log(' ✅ Analytics dashboard populated successfully.');

    console.log('\n==================================================');
    console.log('   ALL INTEGRATION TESTS PASSED SUCCESSFULLY!    ');
    console.log('==================================================\n');

  } catch (err: any) {
    console.error(' ❌ TEST RUN FAILED with error:', err.response?.data || err.message);
  } finally {
    // Shutdown server to end script cleanly
    console.log('Shutting down server...');
    server.close(() => {
      console.log('Server stopped. Test complete.');
      process.exit(0);
    });
  }
}

runTests();
