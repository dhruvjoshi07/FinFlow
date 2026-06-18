import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  CircularProgress,
  IconButton,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Send as SendIcon,
  AccountBalanceWallet as WalletIcon,
  AdminPanelSettings as AdminIcon,
  TrendingUp as TrendingUpIcon,
  Shield as ShieldIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { AuthProvider, useAuth } from './context/AuthContext';

const API_URL = 'http://localhost:5000/api';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6366f1' }, // Indigo glow
    secondary: { main: '#10b981' }, // Emerald green
    error: { main: '#f87171' }, // Red alert
    warning: { main: '#fbbf24' }, // Yellow alert
    background: {
      default: '#0b0f19',
      paper: '#111827',
    },
    text: {
      primary: '#f3f4f6',
      secondary: '#9ca3af',
    },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(17, 24, 39, 0.7)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
        },
      },
    },
  },
});

function AppContent() {
  const { user, token, loading, login, register, logout, refreshProfile } = useAuth();
  
  // Auth Form State
  const [authTab, setAuthTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');

  // App Tabs
  const [activeTab, setActiveTab] = useState(0);

  // User Dashboard State
  const [wallets, setWallets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Send Money State
  const [senderWalletId, setSenderWalletId] = useState('');
  const [receiverEmail, setReceiverEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  // Dialog States
  const [openCreateWallet, setOpenCreateWallet] = useState(false);
  const [newCurrency, setNewCurrency] = useState('USD');
  const [openDeposit, setOpenDeposit] = useState(false);
  const [depositWalletId, setDepositWalletId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');

  // Admin Dashboard State
  const [pendingKycUsers, setPendingKycUsers] = useState<any[]>([]);
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [forexFrom, setForexFrom] = useState('USD');
  const [forexTo, setForexTo] = useState('INR');
  const [forexRate, setForexRate] = useState('');

  // Notifications
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('success');
  const [showToast, setShowToast] = useState(false);

  const showNotification = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    if (!token) return;
    setLoadingDashboard(true);
    try {
      const walletsRes = await axios.get(`${API_URL}/wallet/list`);
      setWallets(walletsRes.data);
      if (walletsRes.data.length > 0 && !senderWalletId) {
        setSenderWalletId(walletsRes.data[0].id);
      }

      const txRes = await axios.get(`${API_URL}/transfer/history`);
      setTransactions(txRes.data);
    } catch (err: any) {
      console.error(err);
      showNotification('Failed to load wallet data', 'error');
    } finally {
      setLoadingDashboard(false);
    }
  };

  // Fetch admin dashboard data
  const fetchAdminData = async () => {
    if (!token || user?.role !== 'ADMIN') return;
    setLoadingAdmin(true);
    try {
      const kycRes = await axios.get(`${API_URL}/admin/kyc/pending`);
      setPendingKycUsers(kycRes.data);

      const alertsRes = await axios.get(`${API_URL}/admin/fraud/alerts`);
      setFraudAlerts(alertsRes.data);

      const analyticsRes = await axios.get(`${API_URL}/analytics/dashboard`);
      setAnalytics(analyticsRes.data);
    } catch (err: any) {
      console.error(err);
      showNotification('Failed to load admin logs', 'error');
    } finally {
      setLoadingAdmin(false);
    }
  };

  // Trigger preview fetch on transfer field updates
  useEffect(() => {
    const getPreview = async () => {
      if (!senderWalletId || !receiverEmail || !amount || Number(amount) <= 0) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const sourceWallet = wallets.find((w) => w.id === senderWalletId);
        if (!sourceWallet) return;

        // Fetch preview
        // We'll target USD if recipient has USD, or EUR. Let's make preview mock locally or request server preview
        // First we'll do the server-side preview request
        const res = await axios.post(`${API_URL}/transfer/preview`, {
          fromCurrency: sourceWallet.currency,
          toCurrency: sourceWallet.currency, // default same currency if we don't know recipient's wallet, or we convert
          amount: Number(amount),
        });
        setPreview(res.data);
      } catch (err) {
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    };

    const timer = setTimeout(getPreview, 600);
    return () => clearTimeout(timer);
  }, [senderWalletId, receiverEmail, amount, wallets]);

  // Load data depending on logged in status and active tabs
  useEffect(() => {
    if (token) {
      refreshProfile();
      fetchDashboardData();
      if (user?.role === 'ADMIN' && activeTab === 1) {
        fetchAdminData();
      }
    }
  }, [token, activeTab, user?.role]);

  // Handle Login / Registration
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authTab === 0) {
        await login(email, password);
        showNotification('Successfully logged in!', 'success');
      } else {
        await register(name, email, password);
        showNotification('Registration successful! KYC profile initialized as PENDING.', 'info');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
      showNotification(err.message || 'Authentication failed', 'error');
    }
  };

  // Handle Create Wallet
  const handleCreateWallet = async () => {
    try {
      const res = await axios.post(`${API_URL}/wallet/create`, { currency: newCurrency });
      showNotification(res.data.message || 'Wallet created!', 'success');
      setOpenCreateWallet(false);
      fetchDashboardData();
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Failed to create wallet', 'error');
    }
  };

  // Handle Deposit
  const handleDeposit = async () => {
    try {
      const res = await axios.post(`${API_URL}/wallet/deposit`, {
        walletId: depositWalletId,
        amount: Number(depositAmount),
      });
      showNotification(res.data.message || 'Deposit successful!', 'success');
      setOpenDeposit(false);
      setDepositAmount('');
      fetchDashboardData();
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Deposit failed', 'error');
    }
  };

  // Handle Send Money Transfer
  const handleSendTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendLoading(true);
    try {
      const res = await axios.post(`${API_URL}/transfer/send`, {
        senderWalletId,
        receiverEmail,
        amount: Number(amount),
      });

      if (res.data.status === 'FLAGGED') {
        showNotification('Compliance Warning: Transfer flagged for admin audit check!', 'warning');
      } else {
        showNotification('Funds transferred successfully!', 'success');
      }

      setAmount('');
      setReceiverEmail('');
      setPreview(null);
      fetchDashboardData();
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Transfer failed', 'error');
    } finally {
      setSendLoading(false);
    }
  };

  // Handle KYC verification
  const handleVerifyKyc = async (userId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await axios.post(`${API_URL}/admin/kyc/verify`, { userId, status });
      showNotification(res.data.message, status === 'APPROVED' ? 'success' : 'warning');
      fetchAdminData();
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'KYC verification failed', 'error');
    }
  };

  // Handle Fraud Alert Resolution
  const handleResolveAlert = async (alertId: string, action: 'RELEASE' | 'CANCEL') => {
    try {
      const res = await axios.post(`${API_URL}/admin/fraud/resolve`, { alertId, action });
      showNotification(res.data.message, action === 'RELEASE' ? 'success' : 'info');
      fetchAdminData();
      fetchDashboardData();
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Action failed', 'error');
    }
  };

  // Handle Exchange rate manual update
  const handleUpdateExchangeRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/admin/exchange-rate`, {
        fromCurrency: forexFrom,
        toCurrency: forexTo,
        rate: Number(forexRate),
      });
      showNotification(res.data.message, 'success');
      setForexRate('');
      fetchAdminData();
    } catch (err: any) {
      showNotification(err.response?.data?.error || 'Exchange rate update failed', 'error');
    }
  };

  const getStatusChipClass = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'COMPLETED') return 'badge-completed';
    if (s === 'PENDING') return 'badge-pending';
    if (s === 'FLAGGED') return 'badge-flagged';
    return 'badge-failed';
  };

  const getKycBadgeColor = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'APPROVED') return 'success';
    if (s === 'REJECTED') return 'error';
    return 'warning';
  };

  // UI rendering when loading initial auth check
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress size={50} color="primary" />
      </Box>
    );
  }

  // Auth Screen (Not Logged In)
  if (!token) {
    return (
      <Container maxWidth="xs" sx={{ mt: 8 }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h3" fontWeight={800} className="glow-text-primary" sx={{ letterSpacing: -1 }}>
            FinFlow
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Cross-Border Payments & Compliance Platform
          </Typography>
        </Box>

        <Card sx={{ p: 1 }}>
          <Tabs
            value={authTab}
            onChange={(_, val) => setAuthTab(val)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
          >
            <Tab label="Log In" />
            <Tab label="Register" />
          </Tabs>

          <CardContent>
            <Box component="form" onSubmit={handleAuthSubmit} display="flex" flexDirection="column" gap={2}>
              {authTab === 1 && (
                <TextField
                  label="Full Name"
                  variant="outlined"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                  required
                />
              )}
              <TextField
                label="Email Address"
                type="email"
                variant="outlined"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
              />
              <TextField
                label="Password"
                type="password"
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                required
              />
              
              {authTab === 1 && (
                <Alert severity="info" sx={{ mt: 1, fontSize: '0.8rem' }}>
                  💡 Default registered users start with PENDING KYC status. Set your email to containing "admin" to seed an admin profile.
                </Alert>
              )}

              {authError && <Alert severity="error">{authError}</Alert>}

              <Button type="submit" variant="contained" color="primary" size="large" sx={{ mt: 2 }} fullWidth>
                {authTab === 0 ? 'Sign In' : 'Create Account'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    );
  }

  const COLORS = ['#818cf8', '#34d399', '#f43f5e', '#fbbf24', '#a78bfa'];

  return (
    <Box width="100%" sx={{ minHeight: '100vh', pb: 6 }}>
      {/* Navbar */}
      <Box sx={{ borderBottom: 1, borderColor: 'rgba(255, 255, 255, 0.08)', bg: 'rgba(11, 15, 25, 0.9)', py: 2, px: 4, mb: 4 }}>
        <Grid container alignItems="center" justifyContent="space-between">
          <Grid item>
            <Box display="flex" alignItems="center" gap={1.5}>
              <Typography variant="h5" fontWeight={800} className="glow-text-primary" sx={{ letterSpacing: -0.5 }}>
                FinFlow
              </Typography>
              <Box className="pulse-dot" title="Live connection active" />
            </Box>
          </Grid>
          <Grid item>
            <Box display="flex" alignItems="center" gap={3}>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="subtitle2" fontWeight={600}>{user?.name}</Typography>
                <Box display="flex" alignItems="center" gap={1} justifyContent="flex-end">
                  <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
                  <Chip label={`KYC: ${user?.kycStatus}`} size="small" color={getKycBadgeColor(user?.kycStatus || '')} sx={{ height: 16, fontSize: '0.65rem', fontWeight: 700 }} />
                </Box>
              </Box>

              {user?.role === 'ADMIN' && (
                <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val)} color="primary">
                  <Tab icon={<WalletIcon sx={{ fontSize: '1.2rem' }} />} label="Dashboard" />
                  <Tab icon={<AdminIcon sx={{ fontSize: '1.2rem' }} />} label="Admin Portal" />
                </Tabs>
              )}

              <Button variant="outlined" color="inherit" size="small" onClick={logout}>
                Log Out
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Box>

      {/* Main Content Area */}
      <Container maxWidth="lg">
        {activeTab === 0 ? (
          /* USER DASHBOARD */
          <Grid container spacing={4}>
            {/* Left Column: Wallets Summary & Transactions */}
            <Grid item xs={12} md={8}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2.5}>
                <Typography variant="h5" fontWeight={700}>
                  My Accounts
                </Typography>
                <Box display="flex" gap={1.5}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<WalletIcon />}
                    onClick={() => setOpenCreateWallet(true)}
                  >
                    Open Wallet
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={loadingDashboard ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                    onClick={fetchDashboardData}
                    disabled={loadingDashboard}
                  >
                    {loadingDashboard ? 'Loading...' : 'Refresh'}
                  </Button>
                </Box>
              </Box>

              {/* Wallets Grid */}
              <Grid container spacing={2.5} sx={{ mb: 4.5 }}>
                {wallets.map((wallet) => (
                  <Grid item xs={12} sm={4} key={wallet.id}>
                    <Card className="glass-card">
                      <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography color="text.secondary" fontWeight={500}>{wallet.currency}</Typography>
                          <WalletIcon sx={{ color: 'primary.main', opacity: 0.8 }} />
                        </Box>
                        <Typography variant="h4" fontWeight={800} sx={{ my: 1.5 }}>
                          {wallet.currency === 'INR' ? '₹' : wallet.currency === 'EUR' ? '€' : wallet.currency === 'GBP' ? '£' : '$'}
                          {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Chip
                            label={wallet.status}
                            size="small"
                            color={wallet.status === 'ACTIVE' ? 'success' : 'error'}
                            sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                          />
                          <Button
                            size="small"
                            color="secondary"
                            onClick={() => {
                              setDepositWalletId(wallet.id);
                              setOpenDeposit(true);
                            }}
                          >
                            Add Funds
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
                {wallets.length === 0 && (
                  <Grid item xs={12}>
                    <Alert severity="warning">You do not have any wallets. Click "Open Wallet" to get started.</Alert>
                  </Grid>
                )}
              </Grid>

              {/* Transactions Ledger History */}
              <Typography variant="h5" fontWeight={700} sx={{ mb: 2.5 }}>
                Transaction Ledger & Audit Trail
              </Typography>
              <TableContainer component={Paper} sx={{ borderRadius: '12px', overflow: 'hidden' }}>
                <Table>
                  <TableHead sx={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                    <TableRow>
                      <TableCell>Sender Wallet / Account</TableCell>
                      <TableCell>Recipient Email / Wallet</TableCell>
                      <TableCell align="right">Amount Sent</TableCell>
                      <TableCell align="right">Amount Received</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map((tx) => {
                      const isSender = wallets.some((w) => w.id === tx.senderWalletId);
                      return (
                        <TableRow key={tx.id} hover>
                          <TableCell>
                            {tx.senderWallet ? (
                              <Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {tx.senderWallet.user.name} {isSender && '(You)'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {tx.senderWallet.currency} Wallet
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="body2" color="secondary.main" fontWeight={600}>
                                External Source
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2" fontWeight={600}>
                                {tx.receiverWallet.user.name} {!isSender && '(You)'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {tx.receiverWallet.user.email}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {tx.senderWallet ? (
                              <Typography color={isSender ? 'error.main' : 'inherit'} fontWeight={600}>
                                {isSender ? '-' : ''} {tx.amount.toFixed(2)} {tx.currency}
                              </Typography>
                            ) : '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: !isSender ? 'secondary.main' : 'inherit' }}>
                            {!isSender ? '+' : ''} {tx.convertedAmount.toFixed(2)} {tx.receiverWallet.currency}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={tx.status}
                              size="small"
                              className={getStatusChipClass(tx.status)}
                              sx={{ fontWeight: 700 }}
                            />
                          </TableCell>
                          <TableCell color="text.secondary">
                            {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          No transactions found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>

            {/* Right Column: Send Money Panel */}
            <Grid item xs={12} md={4}>
              <Typography variant="h5" fontWeight={700} sx={{ mb: 2.5 }}>
                Send Payment
              </Typography>
              <Card sx={{ p: 2 }}>
                {user?.kycStatus !== 'APPROVED' && (
                  <Alert severity="warning" sx={{ mb: 2.5 }}>
                    ⚠️ Compliance Block: Your KYC is {user?.kycStatus}. You cannot send payments until an Admin approves your KYC.
                  </Alert>
                )}
                
                <Box component="form" onSubmit={handleSendTransfer} display="flex" flexDirection="column" gap={2.5}>
                  <FormControl fullWidth>
                    <InputLabel>Source Wallet</InputLabel>
                    <Select
                      value={senderWalletId}
                      onChange={(e) => setSenderWalletId(e.target.value)}
                      label="Source Wallet"
                      required
                    >
                      {wallets.map((w) => (
                        <MenuItem key={w.id} value={w.id} disabled={w.status === 'FROZEN'}>
                          {w.currency} Wallet (${w.balance.toFixed(2)}) {w.status === 'FROZEN' && '(FROZEN)'}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Recipient Email"
                    type="email"
                    variant="outlined"
                    value={receiverEmail}
                    onChange={(e) => setReceiverEmail(e.target.value)}
                    placeholder="receiver@finflow.com"
                    fullWidth
                    required
                  />

                  <TextField
                    label="Amount to Send"
                    type="number"
                    variant="outlined"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputProps={{ min: 0.01, step: 'any' }}
                    fullWidth
                    required
                  />

                  {/* Dynamic Transfer Preview */}
                  {previewLoading && (
                    <Box display="flex" justifyContent="center" py={1.5}>
                      <CircularProgress size={24} />
                    </Box>
                  )}

                  {preview && (
                    <Box sx={{ p: 2, borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <Typography variant="subtitle2" color="primary" gutterBottom sx={{ fontWeight: 700 }}>
                        Conversion Preview
                      </Typography>
                      <Grid container spacing={1} sx={{ fontSize: '0.85rem' }}>
                        <Grid item xs={7} sx={{ color: 'text.secondary' }}>Exchange Rate:</Grid>
                        <Grid item xs={5} sx={{ textAlign: 'right', fontWeight: 600 }}>1 {preview.fromCurrency} = {preview.rate} {preview.toCurrency}</Grid>
                        <Grid item xs={7} sx={{ color: 'text.secondary' }}>Est. Recipient Receives:</Grid>
                        <Grid item xs={5} sx={{ textAlign: 'right', fontWeight: 700, color: 'secondary.main' }}>{preview.convertedAmount} {preview.toCurrency}</Grid>
                        <Grid item xs={7} sx={{ color: 'text.secondary' }}>Platform Fee (1.5%):</Grid>
                        <Grid item xs={5} sx={{ textAlign: 'right', fontWeight: 600 }}>{preview.fee} {preview.fromCurrency}</Grid>
                        <Grid item xs={7} sx={{ color: 'text.secondary', pt: 1, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>Total Debited:</Grid>
                        <Grid item xs={5} sx={{ textAlign: 'right', pt: 1, borderTop: '1px dashed rgba(255,255,255,0.1)', fontWeight: 700, color: 'error.main' }}>
                          {preview.totalCost} {preview.fromCurrency}
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    size="large"
                    disabled={user?.kycStatus !== 'APPROVED' || sendLoading || !amount}
                    startIcon={sendLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                    fullWidth
                  >
                    {sendLoading ? 'Processing...' : 'Authorize Transaction'}
                  </Button>
                </Box>
              </Card>
            </Grid>
          </Grid>
        ) : (
          /* ADMIN PORTAL */
          <Box display="flex" flexDirection="column" gap={4.5}>
            {loadingAdmin && (
              <Box display="flex" alignItems="center" gap={1.5} sx={{ mb: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">Refreshing compliance ledger...</Typography>
              </Box>
            )}
            {/* KPI Stats Cards */}
            {analytics && (
              <Grid container spacing={3}>
                <Grid item xs={12} sm={3}>
                  <Card sx={{ borderLeft: '4px solid #818cf8' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography color="text.secondary" variant="caption" fontWeight={600}>TOTAL VOLUME PROCESSED</Typography>
                      <Typography variant="h4" fontWeight={800} sx={{ my: 0.5 }}>
                        ${analytics.summary.totalVolumeUSD.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="secondary.main" display="flex" alignItems="center" gap={0.5}>
                        <TrendingUpIcon sx={{ fontSize: '0.9rem' }} /> Live simulated ledger volume
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card sx={{ borderLeft: '4px solid #34d399' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography color="text.secondary" variant="caption" fontWeight={600}>DAILY TRANSACTIONS COUNT</Typography>
                      <Typography variant="h4" fontWeight={800} sx={{ my: 0.5 }}>
                        {analytics.summary.completedTxCount}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Completed peer transfers
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card sx={{ borderLeft: '4px solid #fbbf24' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography color="text.secondary" variant="caption" fontWeight={600}>MONTHLY PLATFORM FEES</Typography>
                      <Typography variant="h4" fontWeight={800} sx={{ my: 0.5 }}>
                        ${analytics.summary.totalRevenueUSD.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="secondary.main">
                        Revenue credited to ledger
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card sx={{ borderLeft: '4px solid #f87171' }}>
                    <CardContent sx={{ py: 2 }}>
                      <Typography color="text.secondary" variant="caption" fontWeight={600}>COMPLIANCE FRAUD RATE</Typography>
                      <Typography variant="h4" fontWeight={800} sx={{ my: 0.5 }} color="error.main">
                        {analytics.summary.fraudPercentage}%
                      </Typography>
                      <Typography variant="caption" color="error.main" display="flex" alignItems="center" gap={0.5}>
                        <ShieldIcon sx={{ fontSize: '0.9rem' }} /> {analytics.summary.flaggedTxCount} alert triggers
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}

            {/* Charts Section */}
            {analytics && (
              <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                  <Card sx={{ p: 2 }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                      Transaction Volume Trend (USD)
                    </Typography>
                    <Box sx={{ height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics.dailyTrends}>
                          <defs>
                            <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
                          <YAxis stroke="#9ca3af" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.1)' }} />
                          <Area type="monotone" dataKey="volumeUSD" name="Volume ($)" stroke="#818cf8" fillOpacity={1} fill="url(#colorVolume)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Box>
                  </Card>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Card sx={{ p: 2 }}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                      Currency Distribution
                    </Typography>
                    <Box sx={{ height: 260, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.currencyBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {analytics.currencyBreakdown.map((_: any, idx: number) => (
                              <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any) => `$${Number(value).toFixed(2)}`} />
                          <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                  </Card>
                </Grid>
              </Grid>
            )}

            {/* Admin Controls Panels */}
            <Grid container spacing={3.5}>
              {/* Left Column: KYC Approval & Fraud Alerts */}
              <Grid item xs={12} md={8} display="flex" flexDirection="column" gap={4.5}>
                {/* Pending KYC Approvals */}
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                    Compliance: Pending KYC Reviews
                  </Typography>
                  <TableContainer component={Paper} sx={{ borderRadius: '12px' }}>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <TableRow>
                          <TableCell>Applicant Name</TableCell>
                          <TableCell>Email Address</TableCell>
                          <TableCell>Current Status</TableCell>
                          <TableCell align="center">Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pendingKycUsers.map((applicant) => (
                          <TableRow key={applicant.id}>
                            <TableCell sx={{ fontWeight: 600 }}>{applicant.name}</TableCell>
                            <TableCell>{applicant.email}</TableCell>
                            <TableCell>
                              <Chip label={applicant.kycStatus} color="warning" size="small" sx={{ fontWeight: 700, height: 18, fontSize: '0.65rem' }} />
                            </TableCell>
                            <TableCell align="center">
                              <Box display="flex" justifyContent="center" gap={1}>
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => handleVerifyKyc(applicant.id, 'APPROVED')}
                                  title="Approve KYC"
                                >
                                  <CheckIcon sx={{ fontSize: '1.1rem' }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleVerifyKyc(applicant.id, 'REJECTED')}
                                  title="Reject KYC"
                                >
                                  <CloseIcon sx={{ fontSize: '1.1rem' }} />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                        {pendingKycUsers.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                              No users pending KYC checks.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>

                {/* Fraud Alerts Centre */}
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                    Compliance Alerts: Flagged Transactions Audit
                  </Typography>
                  <TableContainer component={Paper} sx={{ borderRadius: '12px' }}>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <TableRow>
                          <TableCell>Sender</TableCell>
                          <TableCell>Recipient</TableCell>
                          <TableCell>Amount</TableCell>
                          <TableCell>Risk Score</TableCell>
                          <TableCell>Trigger Reason</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="center">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {fraudAlerts.map((alert) => (
                          <TableRow key={alert.id}>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{alert.transaction.senderWallet.user.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{alert.transaction.currency} Wallet</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>{alert.transaction.receiverWallet.user.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{alert.transaction.receiverWallet.user.email}</Typography>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              {alert.transaction.amount} {alert.transaction.currency}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={`${alert.riskScore}/100`}
                                size="small"
                                color={alert.riskScore >= 70 ? 'error' : 'warning'}
                                sx={{ fontWeight: 800, height: 18, fontSize: '0.65rem' }}
                              />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', maxWidth: 180 }}>
                              {alert.reason}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={alert.status}
                                size="small"
                                variant="outlined"
                                color={alert.status === 'NEW' ? 'error' : 'default'}
                                sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              {alert.status === 'NEW' ? (
                                <Box display="flex" gap={0.5} justifyContent="center">
                                  <Button
                                    variant="contained"
                                    color="success"
                                    size="small"
                                    onClick={() => handleResolveAlert(alert.id, 'RELEASE')}
                                    sx={{ py: 0.2, px: 1, fontSize: '0.7rem' }}
                                  >
                                    Release
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    color="error"
                                    size="small"
                                    onClick={() => handleResolveAlert(alert.id, 'CANCEL')}
                                    sx={{ py: 0.2, px: 1, fontSize: '0.7rem' }}
                                  >
                                    Cancel
                                  </Button>
                                </Box>
                              ) : (
                                <Typography variant="caption" color="text.secondary">Resolved</Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {fraudAlerts.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                              No compliance fraud alerts found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Grid>

              {/* Right Column: Exchange Rate Controller & Audit Logs */}
              <Grid item xs={12} md={4} display="flex" flexDirection="column" gap={4.5}>
                {/* Forex Rates Configurator */}
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                    Manage Exchange Rates
                  </Typography>
                  <Card sx={{ p: 2 }}>
                    <Box component="form" onSubmit={handleUpdateExchangeRate} display="flex" flexDirection="column" gap={2}>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <FormControl fullWidth size="small">
                            <InputLabel>From</InputLabel>
                            <Select
                              value={forexFrom}
                              onChange={(e) => setForexFrom(e.target.value)}
                              label="From"
                            >
                              {['USD', 'EUR', 'GBP', 'INR', 'JPY'].map((c) => (
                                <MenuItem key={c} value={c}>{c}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                          <FormControl fullWidth size="small">
                            <InputLabel>To</InputLabel>
                            <Select
                              value={forexTo}
                              onChange={(e) => setForexTo(e.target.value)}
                              label="To"
                            >
                              {['USD', 'EUR', 'GBP', 'INR', 'JPY'].map((c) => (
                                <MenuItem key={c} value={c}>{c}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                      </Grid>

                      <TextField
                        label="Conversion Rate"
                        type="number"
                        size="small"
                        variant="outlined"
                        value={forexRate}
                        onChange={(e) => setForexRate(e.target.value)}
                        placeholder="e.g. 83.15"
                        inputProps={{ step: 'any', min: 0.0001 }}
                        required
                        fullWidth
                      />

                      <Button type="submit" variant="contained" color="primary" size="medium" fullWidth>
                        Update Forex Table
                      </Button>
                    </Box>
                  </Card>
                </Box>

                {/* Audit Logs Trail */}
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                    Real-time Audit Trail (Logs)
                  </Typography>
                  <Paper sx={{ p: 2, maxHeight: 310, overflowY: 'auto', borderRadius: '12px' }}>
                    {analytics?.auditLogs.map((log: any) => (
                      <Box key={log.id} sx={{ mb: 1.8, borderBottom: '1px solid rgba(255,255,255,0.03)', pb: 1 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                            {log.action}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" display="block">
                          User: {log.user ? log.user.name : 'SYSTEM'} ({log.user ? log.user.email : 'cronjob'})
                        </Typography>
                        {log.ipAddress && (
                          <Typography variant="caption" color="text.secondary">
                            IP: {log.ipAddress}
                          </Typography>
                        )}
                      </Box>
                    ))}
                    {(!analytics || analytics.auditLogs.length === 0) && (
                      <Typography align="center" color="text.secondary">No audit logs registered yet.</Typography>
                    )}
                  </Paper>
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}
      </Container>

      {/* dialogs */}
      {/* 1. Open Wallet */}
      <Dialog open={openCreateWallet} onClose={() => setOpenCreateWallet(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Open a New Multi-Currency Wallet</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} sx={{ pt: 1, minWidth: 280 }}>
            <Typography variant="body2" color="text.secondary">
              Select the currency you would like to open an account in. You can maintain multiple currency wallets simultaneously.
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Currency</InputLabel>
              <Select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                label="Currency"
              >
                {['USD', 'EUR', 'GBP', 'INR', 'JPY'].map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreateWallet(false)}>Cancel</Button>
          <Button onClick={handleCreateWallet} variant="contained">Open Account</Button>
        </DialogActions>
      </Dialog>

      {/* 2. Deposit Simulator */}
      <Dialog open={openDeposit} onClose={() => setOpenDeposit(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Deposit Funds (Simulate Inflow)</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} sx={{ pt: 1, minWidth: 280 }}>
            <Typography variant="body2" color="text.secondary">
              Enter the amount of funds you wish to deposit to simulate external merchant inflows.
            </Typography>
            <TextField
              label="Simulated Amount"
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              inputProps={{ min: 1 }}
              required
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeposit(false)}>Cancel</Button>
          <Button onClick={handleDeposit} variant="contained" color="secondary">Confirm Deposit</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar notification */}
      <Snackbar
        open={showToast}
        autoHideDuration={4000}
        onClose={() => setShowToast(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toastType} onClose={() => setShowToast(false)} sx={{ width: '100%', fontWeight: 600 }}>
          {toastMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
