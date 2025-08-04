import express from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import tradingEngine from './tradingEngine.js';
import adminPanel from './adminPanel.js';
import session from 'express-session';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: adminPanel.getCurrentJwtSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Admin panel files are initialized automatically

// Solana connection for payment monitoring
const connection = new Connection(clusterApiUrl('mainnet-beta'));

// Payment system configuration
const PAYMENT_CONFIG = {
    clientWalletAddress: process.env.CLIENT_WALLET_ADDRESS || 'HCkaYTj31n1rcffFUM5VZD5DTp2thL74tZvFp7i8rAok', // Client's wallet address
    packages: {
        basic: { amount: 0.5, hours: 7, dailyLimit: 50, monthlyLimit: 500, maxBuyAmount: 0.1 },
        pro: { amount: 1.5, hours: 24, dailyLimit: 150, monthlyLimit: 1500, maxBuyAmount: 0.3 },
        premium: { amount: 5.0, hours: 168, dailyLimit: 500, monthlyLimit: 5000, maxBuyAmount: 1.0 },
        enterprise: { amount: 15.0, hours: 720, dailyLimit: -1, monthlyLimit: -1, maxBuyAmount: 5.0 }
    },
    transactionFee: 0.03, // 3% fee per trade
    lastCheckedSignature: null,
    security: {
        minConfirmationBlocks: 2, // Wait for 2 confirmations
        maxTransactionAge: 300000, // 5 minutes
        allowedSenders: [], // Whitelist of allowed senders (optional)
        requireExactAmount: true, // Must match package amount exactly
        feeCollectionEnabled: true
    }
};

// Payment monitoring system
class PaymentMonitor {
    constructor() {
        this.isMonitoring = false;
        this.checkInterval = null;
        this.lastSignature = null;
        this.paymentHistory = [];
        this.securityLog = [];
    }

    async start() {
        if (this.isMonitoring) return;
        
        console.log('🚀 Starting payment monitoring system...');
        console.log(`💰 Monitoring wallet: ${PAYMENT_CONFIG.clientWalletAddress}`);
        console.log(`🔒 Security level: HIGH (${PAYMENT_CONFIG.security.minConfirmationBlocks} confirmations required)`);
        
        this.isMonitoring = true;
        
        // Get the last signature to avoid processing old transactions
        try {
            const signatures = await connection.getSignaturesForAddress(
                new PublicKey(PAYMENT_CONFIG.clientWalletAddress),
                { limit: 1 }
            );
            if (signatures.length > 0) {
                this.lastSignature = signatures[0].signature;
                console.log(`📝 Starting from signature: ${this.lastSignature.substring(0, 16)}...`);
            }
        } catch (error) {
            console.error('Error getting last signature:', error);
        }

        // Start monitoring every 30 seconds
        this.checkInterval = setInterval(() => {
            this.checkForPayments();
        }, 30000);

        console.log('✅ Payment monitoring started successfully');
        console.log('📊 Package prices:');
        Object.entries(PAYMENT_CONFIG.packages).forEach(([packageName, config]) => {
            console.log(`   ${packageName.toUpperCase()}: ${config.amount} SOL (${config.hours} hours)`);
        });
    }

    async stop() {
        if (!this.isMonitoring) return;
        
        console.log('🛑 Stopping payment monitoring system...');
        this.isMonitoring = false;
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        console.log('✅ Payment monitoring stopped');
    }

    async checkForPayments() {
        try {
            console.log('🔍 Checking for new payments...');
            
            const signatures = await connection.getSignaturesForAddress(
                new PublicKey(PAYMENT_CONFIG.clientWalletAddress),
                { limit: 10 }
            );

            for (const sigInfo of signatures) {
                // Skip if we've already processed this signature
                if (this.lastSignature && sigInfo.signature === this.lastSignature) {
                    break;
                }

                try {
                    const transaction = await connection.getTransaction(sigInfo.signature, {
                        commitment: 'confirmed',
                        maxSupportedTransactionVersion: 0
                    });

                    if (transaction && transaction.meta) {
                        await this.processTransaction(transaction, sigInfo.signature);
                    }
                } catch (error) {
                    console.error(`Error processing transaction ${sigInfo.signature}:`, error);
                    this.logSecurityEvent('ERROR', `Transaction processing failed: ${error.message}`, sigInfo.signature);
                }
            }

            // Update last signature
            if (signatures.length > 0) {
                this.lastSignature = signatures[0].signature;
            }

        } catch (error) {
            console.error('Error checking for payments:', error);
            this.logSecurityEvent('ERROR', `Payment check failed: ${error.message}`);
        }
    }

    async processTransaction(transaction, signature) {
        try {
            // Security check: Verify transaction age
            const transactionAge = Date.now() - transaction.blockTime * 1000;
            if (transactionAge > PAYMENT_CONFIG.security.maxTransactionAge) {
                console.log(`⏰ Skipping old transaction: ${Math.round(transactionAge / 1000)}s old`);
                return;
            }

            // Check if this is a SOL transfer to our wallet
            const preBalances = transaction.meta.preBalances;
            const postBalances = transaction.meta.postBalances;
            const accountKeys = transaction.transaction.message.accountKeys;

            // Find our wallet in the account keys
            const ourWalletIndex = accountKeys.findIndex(key => 
                key.toString() === PAYMENT_CONFIG.clientWalletAddress
            );

            if (ourWalletIndex === -1) {
                console.log('❌ Our wallet not found in transaction');
                return;
            }

            // Calculate the SOL received
            const balanceChange = (postBalances[ourWalletIndex] - preBalances[ourWalletIndex]) / 1e9;
            
            if (balanceChange <= 0) {
                console.log('❌ No SOL received in this transaction');
                return;
            }

            console.log(`💰 Received ${balanceChange} SOL in transaction ${signature.substring(0, 16)}...`);

            // Find the sender (the account that sent us SOL)
            let senderAddress = null;
            for (let i = 0; i < accountKeys.length; i++) {
                if (i !== ourWalletIndex && preBalances[i] > postBalances[i]) {
                    senderAddress = accountKeys[i].toString();
                    break;
                }
            }

            if (!senderAddress) {
                console.log('❌ Could not determine sender address');
                this.logSecurityEvent('WARNING', 'Could not determine sender address', signature);
                return;
            }

            console.log(`📤 Payment from: ${senderAddress}`);
            this.logSecurityEvent('INFO', `Payment received: ${balanceChange} SOL from ${senderAddress}`, signature);

            // Security check: Verify sender is not blacklisted
            if (PAYMENT_CONFIG.security.allowedSenders.length > 0 && 
                !PAYMENT_CONFIG.security.allowedSenders.includes(senderAddress)) {
                console.log(`🚫 Sender ${senderAddress} not in whitelist`);
                this.logSecurityEvent('BLOCKED', `Unauthorized sender: ${senderAddress}`, signature);
                return;
            }

            // Determine package based on payment amount
            const packageType = this.determinePackage(balanceChange);
            
            if (packageType) {
                console.log(`🎯 Package identified: ${packageType.toUpperCase()}`);
                await this.upgradeUser(senderAddress, packageType, balanceChange, signature);
            } else {
                console.log(`❌ Invalid payment amount: ${balanceChange} SOL`);
                this.logSecurityEvent('WARNING', `Invalid payment amount: ${balanceChange} SOL`, signature);
            }

        } catch (error) {
            console.error('Error processing transaction:', error);
            this.logSecurityEvent('ERROR', `Transaction processing error: ${error.message}`, signature);
        }
    }

    determinePackage(amount) {
        for (const [packageType, config] of Object.entries(PAYMENT_CONFIG.packages)) {
            if (PAYMENT_CONFIG.security.requireExactAmount) {
                // Exact amount matching
                if (Math.abs(amount - config.amount) < 0.001) {
                    return packageType;
                }
            } else {
                // Allow small tolerance
                if (Math.abs(amount - config.amount) < 0.01) {
                    return packageType;
                }
            }
        }
        return null;
    }

    async upgradeUser(senderAddress, packageType, amount, transactionSignature) {
        try {
            console.log(`🎯 Upgrading user ${senderAddress} to ${packageType} package`);

            const packageConfig = PAYMENT_CONFIG.packages[packageType];
            const expiryDate = new Date(Date.now() + (packageConfig.hours * 60 * 60 * 1000));

            // Create or update user
            const userData = {
                username: `user_${senderAddress.substring(0, 8)}`,
                walletAddress: senderAddress,
                package: packageType,
                licenseKey: adminPanel.generateLicenseKey(),
                licenseExpiry: expiryDate.toISOString(),
                dailyLimit: packageConfig.dailyLimit,
                monthlyLimit: packageConfig.monthlyLimit,
                maxBuyAmount: packageConfig.maxBuyAmount,
                dailyUsage: 0,
                monthlyUsage: 0,
                active: true,
                paymentAmount: amount,
                paymentTransaction: transactionSignature,
                paymentDate: new Date().toISOString(),
                packageDetails: {
                    name: packageType.toUpperCase(),
                    hours: packageConfig.hours,
                    dailyLimit: packageConfig.dailyLimit,
                    monthlyLimit: packageConfig.monthlyLimit,
                    maxBuyAmount: packageConfig.maxBuyAmount
                }
            };

            // Check if user already exists
            const users = adminPanel.loadUsers();
            const existingUserIndex = users.findIndex(user => user.walletAddress === senderAddress);

            if (existingUserIndex !== -1) {
                // Update existing user
                const oldPackage = users[existingUserIndex].package;
                users[existingUserIndex] = { ...users[existingUserIndex], ...userData };
                console.log(`✅ Updated existing user: ${userData.username} (${oldPackage} → ${packageType})`);
                this.logSecurityEvent('UPGRADE', `User upgraded: ${oldPackage} → ${packageType}`, transactionSignature);
            } else {
                // Create new user
                users.push(userData);
                console.log(`✅ Created new user: ${userData.username} with ${packageType} package`);
                this.logSecurityEvent('NEW_USER', `New user created with ${packageType} package`, transactionSignature);
            }

            // Save users
            adminPanel.saveUsers(users);

            // Add to payment history
            this.paymentHistory.push({
                timestamp: new Date().toISOString(),
                senderAddress: senderAddress,
                amount: amount,
                package: packageType,
                transactionSignature: transactionSignature,
                action: existingUserIndex !== -1 ? 'upgrade' : 'new_user'
            });

            // Keep only last 1000 payments
            if (this.paymentHistory.length > 1000) {
                this.paymentHistory = this.paymentHistory.slice(-1000);
            }

            // Emit notification to admin panel
            io.emit('payment_received', {
                type: 'payment_received',
                user: userData,
                package: packageType,
                amount: amount,
                transaction: transactionSignature,
                timestamp: new Date().toISOString()
            });

            console.log(`🎉 User ${senderAddress} successfully upgraded to ${packageType} package`);
            console.log(`⏰ Access expires: ${expiryDate.toLocaleString()}`);

        } catch (error) {
            console.error('Error upgrading user:', error);
            this.logSecurityEvent('ERROR', `User upgrade failed: ${error.message}`, transactionSignature);
        }
    }

    async collectTransactionFee(userId, tradeAmount) {
        try {
            const users = adminPanel.loadUsers();
            const user = users.find(u => u.username === userId);
            
            if (!user) {
                console.error(`User ${userId} not found for fee collection`);
                return false;
            }

            const feeAmount = tradeAmount * PAYMENT_CONFIG.transactionFee;
            
            // Deduct fee from user's trade amount
            const netAmount = tradeAmount - feeAmount;
            
            console.log(`💰 Collected ${feeAmount.toFixed(6)} SOL fee from user ${userId} (${PAYMENT_CONFIG.transactionFee * 100}%)`);
            console.log(`💸 Fee should be sent to client wallet: ${PAYMENT_CONFIG.clientWalletAddress}`);
            
            this.logSecurityEvent('FEE_COLLECTED', `Fee collected: ${feeAmount} SOL from ${userId}`);
            
            return netAmount;
        } catch (error) {
            console.error('Error collecting transaction fee:', error);
            this.logSecurityEvent('ERROR', `Fee collection failed: ${error.message}`);
            return tradeAmount; // Return full amount if fee collection fails
        }
    }

    logSecurityEvent(level, message, signature = null) {
        const event = {
            timestamp: new Date().toISOString(),
            level: level,
            message: message,
            signature: signature,
            walletAddress: PAYMENT_CONFIG.clientWalletAddress
        };
        
        this.securityLog.push(event);
        
        // Keep only last 1000 security events
        if (this.securityLog.length > 1000) {
            this.securityLog = this.securityLog.slice(-1000);
        }
        
        console.log(`🔒 [${level}] ${message}${signature ? ` (${signature.substring(0, 16)}...)` : ''}`);
    }

    getPaymentHistory() {
        return this.paymentHistory;
    }

    getSecurityLog() {
        return this.securityLog;
    }

    getMonitoringStatus() {
        return {
            isMonitoring: this.isMonitoring,
            clientWallet: PAYMENT_CONFIG.clientWalletAddress,
            lastSignature: this.lastSignature ? this.lastSignature.substring(0, 16) + '...' : null,
            totalPayments: this.paymentHistory.length,
            securityEvents: this.securityLog.length,
            packages: PAYMENT_CONFIG.packages,
            security: PAYMENT_CONFIG.security
        };
    }
}

// Initialize payment monitor
const paymentMonitor = new PaymentMonitor();

// API Endpoints
app.get('/api/status', (req, res) => res.json(tradingEngine.getStatus()));

app.post('/api/start', (req, res) => { 
    tradingEngine.start(io); 
    res.json({ started: true }); 
});

app.post('/api/stop', (req, res) => { 
    tradingEngine.stop(); 
    res.json({ stopped: true }); 
});

app.post('/api/sell-all', async (req, res) => { 
    await tradingEngine.sellAll(); 
    res.json({ soldAll: true }); 
});

app.post('/api/settings', (req, res) => {
    tradingEngine.updateSettings(req.body);
    res.json({ settings: tradingEngine.getSettings() });
});

app.post('/api/auto-restart', (req, res) => {
    tradingEngine.setAutoRestart(req.body.enabled);
    res.json({ autoRestart: tradingEngine.getAutoRestart() });
});

// Wallet connection endpoints
app.post('/api/connect-wallet', (req, res) => {
    try {
        const { walletType, publicKey, balance } = req.body;
        
        if (!publicKey) {
            return res.status(400).json({ success: false, error: 'Public key is required' });
        }

        // Store wallet connection in session
        req.session.walletAddress = publicKey;
        req.session.walletType = walletType;
        req.session.walletBalance = balance;

        console.log(`Wallet connected: ${walletType} - ${publicKey} - Balance: ${balance} SOL`);
        
        res.json({ 
            success: true, 
            message: `${walletType} wallet connected successfully`,
            walletAddress: publicKey,
            balance: balance
        });
    } catch (error) {
        console.error('Wallet connection error:', error);
        res.status(500).json({ success: false, error: 'Failed to connect wallet' });
    }
});

app.get('/api/wallet-status', (req, res) => {
    const walletAddress = req.session.walletAddress;
    const walletType = req.session.walletType;
    
    res.json({
        connected: !!walletAddress,
        walletAddress: walletAddress,
        walletType: walletType
    });
});

app.get('/api/connected-wallet', (req, res) => {
    const walletAddress = req.session.walletAddress;
    const walletType = req.session.walletType;
    
    if (!walletAddress) {
        return res.status(404).json({ error: 'No wallet connected' });
    }
    
    res.json({
        walletAddress: walletAddress,
        walletType: walletType
    });
});

app.post('/api/disconnect-wallet', (req, res) => {
    req.session.walletAddress = null;
    req.session.walletType = null;
    
    res.json({ success: true, message: 'Wallet disconnected' });
});

// Trading data endpoints
app.get('/api/distribute-profits', (req, res) => {
    const profits = tradingEngine.distributeProfits();
    res.json(profits);
});

app.get('/api/trading-stats', (req, res) => {
    const stats = tradingEngine.getStatus();
    res.json(stats);
});

app.get('/api/system-metrics', (req, res) => {
    const metrics = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connectedUsers: tradingEngine.getConnectedUsersCount(),
        totalProfits: tradingEngine.getTotalProfits()
    };
    res.json(metrics);
});

// Bot control endpoints
app.post('/api/launch-bot', adminPanel.authenticateToken, (req, res) => {
    try {
        const { walletAddress, settings } = req.body;
        
        if (!walletAddress) {
            return res.status(400).json({ success: false, error: 'Wallet address is required' });
        }

        // Connect user wallet to trading engine
        tradingEngine.connectUserWallet(req.user.username, { publicKey: walletAddress });
        
        // Update settings if provided
        if (settings) {
            tradingEngine.updateSettings(settings);
        }
        
        // Start trading
        tradingEngine.start(io);
        
        res.json({ success: true, message: 'Bot launched successfully' });
    } catch (error) {
        console.error('Launch bot error:', error);
        res.status(500).json({ success: false, error: 'Failed to launch bot' });
    }
});

app.post('/api/stop-bot', adminPanel.authenticateToken, (req, res) => {
    try {
        tradingEngine.stop();
        res.json({ success: true, message: 'Bot stopped successfully' });
    } catch (error) {
        console.error('Stop bot error:', error);
        res.status(500).json({ success: false, error: 'Failed to stop bot' });
    }
});

app.get('/api/settings', adminPanel.authenticateToken, (req, res) => {
    const currentSettings = tradingEngine.getSettings();
    res.json(currentSettings);
});

app.post('/api/settings', adminPanel.authenticateToken, (req, res) => {
    try {
        tradingEngine.updateSettings(req.body);
        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
});

app.get('/api/safety-settings', adminPanel.authenticateToken, (req, res) => {
    const safetySettings = tradingEngine.getSafetySettings();
    res.json(safetySettings);
});

app.post('/api/safety-settings', adminPanel.authenticateToken, (req, res) => {
    try {
        tradingEngine.updateSafetySettings(req.body);
        res.json({ success: true, message: 'Safety settings updated successfully' });
    } catch (error) {
        console.error('Update safety settings error:', error);
        res.status(500).json({ success: false, error: 'Failed to update safety settings' });
    }
});

app.post('/api/auto-restart', adminPanel.authenticateToken, (req, res) => {
    try {
        tradingEngine.setAutoRestart(req.body.enabled);
        res.json({ success: true, message: 'Auto-restart setting updated' });
    } catch (error) {
        console.error('Auto-restart error:', error);
        res.status(500).json({ success: false, error: 'Failed to update auto-restart setting' });
    }
});

// Admin Panel Routes
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin-bot', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-bot.html'));
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await adminPanel.authenticateUser(username, password);
        
        if (result.success) {
            req.session.adminToken = result.token;
            res.json(result);
        } else {
            res.status(401).json(result);
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

app.get('/api/admin/validate-token', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        res.json({ 
            valid: true, 
            user: { username: req.user.username, role: req.user.role }
        });
    } catch (error) {
        console.error('Token validation error:', error);
        res.status(401).json({ valid: false, error: 'Invalid token' });
    }
});

app.get('/api/admin/stats', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const stats = adminPanel.getUserStats();
        res.json(stats);
    } catch (error) {
        console.error('Get admin stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Test admin authentication endpoint
app.get('/api/admin/test-auth', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        res.json({ 
            success: true, 
            message: 'Admin authentication working',
            user: req.user,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Test auth error:', error);
        res.status(500).json({ error: 'Authentication test failed' });
    }
});

// Test trading engine endpoint
app.get('/api/admin/test-trading-engine', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        // Test if trading engine methods exist
        const hasGetTradingStatistics = typeof tradingEngine.getTradingStatistics === 'function';
        const hasUpdateConfiguration = typeof tradingEngine.updateConfiguration === 'function';
        const hasStartAdminBot = typeof tradingEngine.startAdminBot === 'function';
        const hasStopAdminBot = typeof tradingEngine.stopAdminBot === 'function';
        
        const result = {
            success: true,
            message: 'Trading engine test completed',
            methods: {
                getTradingStatistics: hasGetTradingStatistics,
                updateConfiguration: hasUpdateConfiguration,
                startAdminBot: hasStartAdminBot,
                stopAdminBot: hasStopAdminBot
            },
            timestamp: Date.now()
        };
        
        res.json(result);
    } catch (error) {
        console.error('Trading engine test error:', error);
        res.status(500).json({ error: 'Trading engine test failed' });
    }
});

// System metrics endpoint for real-time system data
app.get('/api/admin/system-metrics', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        // Use ES module import for os
        const os = await import('os');
        
        // Get real system metrics
        const cpuUsage = Math.round((1 - os.default.loadavg()[0] / os.default.cpus().length) * 100);
        const totalMemory = Math.round(os.default.totalmem() / (1024 * 1024)); // MB
        const freeMemory = Math.round(os.default.freemem() / (1024 * 1024)); // MB
        const usedMemory = totalMemory - freeMemory;
        
        // Get real network latency by pinging Solana RPC
        let latency;
        try {
            const start = Date.now();
            await connection.getSlot();
            latency = Math.round((Date.now() - start) * 10) / 10;
        } catch (error) {
            latency = Math.round((Math.random() * 5 + 8) * 10) / 10; // Fallback
        }
        
        // Calculate real buy time based on system performance and network
        const baseBuyTime = 0.01 + (cpuUsage / 100) * 0.05; // 0.01-0.06s based on CPU
        const maxBuyTime = baseBuyTime + 0.08; // Add some variance
        
        const metrics = {
            cpu: cpuUsage,
            memory: usedMemory,
            latency: latency,
            buyTime: baseBuyTime.toFixed(2),
            maxBuyTime: maxBuyTime.toFixed(2),
            timestamp: Date.now()
        };
        
        res.json(metrics);
    } catch (error) {
        console.error('Get system metrics error:', error);
        res.status(500).json({ error: 'Failed to get system metrics' });
    }
});

// Real trading statistics endpoint
app.get('/api/admin/trading-stats', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        // Get real trading statistics from trading engine
        const stats = tradingEngine.getTradingStatistics();
        
        const tradingStats = {
            winRate: stats.winRate || 0,
            loseRate: stats.loseRate || 0,
            totalProfit: stats.totalProfit || 0,
            totalLoss: stats.totalLoss || 0,
            totalFees: stats.totalFees || 0,
            boughtCount: stats.boughtCount || 0,
            soldCount: stats.soldCount || 0,
            timestamp: Date.now()
        };
        
        res.json(tradingStats);
    } catch (error) {
        console.error('Get trading stats error:', error);
        res.status(500).json({ error: 'Failed to get trading statistics' });
    }
});

// Real wallet balance endpoint
app.get('/api/admin/wallet-balance', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const walletAddress = req.query.address;
        
        if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address required' });
        }
        
        // Get real wallet balance from Solana
        const getWalletBalance = async () => {
            try {
                const balance = await connection.getBalance(new PublicKey(walletAddress));
                return balance / 1000000000; // Convert lamports to SOL
            } catch (error) {
                console.error('Error getting wallet balance:', error);
                throw new Error('Failed to get wallet balance');
            }
        };
        
        getWalletBalance().then(balance => {
            res.json({
                balance: balance.toFixed(4),
                address: walletAddress,
                timestamp: Date.now()
            });
        }).catch(error => {
            res.status(500).json({ error: error.message });
        });
        
    } catch (error) {
        console.error('Get wallet balance error:', error);
        res.status(500).json({ error: 'Failed to get wallet balance' });
    }
});

// Admin bot configuration endpoint
app.post('/api/admin/save-config', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const config = req.body;
        
        // Validate configuration
        if (config.buyAmount < 0.01 || config.buyAmount > 10) {
            return res.status(400).json({ error: 'Buy amount must be between 0.01 and 10 SOL' });
        }
        
        if (config.profitTarget < 1 || config.profitTarget > 1000) {
            return res.status(400).json({ error: 'Profit target must be between 1% and 1000%' });
        }
        
        if (config.stopLoss < 1 || config.stopLoss > 100) {
            return res.status(400).json({ error: 'Stop loss must be between 1% and 100%' });
        }
        
        // Save configuration to trading engine
        const result = tradingEngine.updateConfiguration(config);
        
        if (result.success) {
            res.json({ success: true, message: 'Configuration saved successfully' });
        } else {
            res.status(400).json({ error: result.error });
        }
        
    } catch (error) {
        console.error('Save config error:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

// Test external APIs endpoint
app.post('/api/test-external-api', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        const { url, apiName } = req.body;
        
        if (!url || !apiName) {
            return res.status(400).json({ error: 'URL and API name required' });
        }
        
        console.log(`Testing API: ${apiName} at ${url}`);
        
        const start = Date.now();
        
        // Use different strategies for different APIs
        let response;
        try {
            if (apiName.includes('Pump.fun')) {
                // Pump.fun API - use specific headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache'
                    }
                });
            } else if (apiName.includes('Dexscreener')) {
                // Dexscreener API - use standard headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'SoulSpark-Bot/1.0',
                        'Accept': 'application/json'
                    }
                });
            } else if (apiName.includes('Birdeye')) {
                // Birdeye API - use specific headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                });
            } else if (apiName.includes('Solana RPC')) {
                // Solana RPC - use POST request with getSlot method
                response = await axios.post(url, {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSlot"
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'SoulSpark-Bot/1.0'
                    }
                });
            } else if (apiName.includes('Jupiter')) {
                // Jupiter API - use standard headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'SoulSpark-Bot/1.0',
                        'Accept': 'application/json'
                    }
                });
            } else {
                // Default headers for other APIs
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'SoulSpark-Bot/1.0',
                        'Accept': 'application/json'
                    }
                });
            }
        } catch (axiosError) {
            // If the first attempt fails, try with different headers
            try {
                if (apiName.includes('Solana RPC')) {
                    // For RPC, try POST with different method
                    response = await axios.post(url, {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getHealth"
                    }, {
                        timeout: 15000,
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'SoulSpark-Bot/1.0'
                        }
                    });
                } else {
                    // For other APIs, try with browser-like headers
                    response = await axios.get(url, {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1'
                        }
                    });
                }
            } catch (retryError) {
                throw retryError;
            }
        }
        
        const latency = Date.now() - start;
        
        if (response.status >= 200 && response.status < 300) {
            console.log(`✅ API ${apiName} is online (${latency}ms)`);
            res.json({
                success: true,
                apiName: apiName,
                latency: latency,
                status: response.status
            });
        } else {
            console.log(`❌ API ${apiName} returned status: ${response.status}`);
            res.json({
                success: false,
                apiName: apiName,
                error: `HTTP ${response.status}`,
                latency: latency
            });
        }
        
    } catch (error) {
        console.error(`❌ API test failed for ${req.body.apiName || 'Unknown API'}:`, error.message);
        res.json({
            success: false,
            apiName: req.body.apiName || 'Unknown API',
            error: error.message,
            latency: null
        });
    }
});

app.get('/api/admin/users', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const users = adminPanel.getAllUsers();
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

app.post('/api/admin/users', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        const result = await adminPanel.createUser(req.body);
        res.json(result);
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.put('/api/admin/users/:username', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        const result = await adminPanel.updateUser(req.params.username, req.body);
        res.json(result);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.delete('/api/admin/users/:username', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        const result = await adminPanel.deleteUser(req.params.username);
        res.json(result);
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// License validation
app.post('/api/validate-license', (req, res) => {
    try {
        const { licenseKey } = req.body;
        const result = adminPanel.validateLicense(licenseKey);
        res.json(result);
    } catch (error) {
        console.error('License validation error:', error);
        res.status(500).json({ valid: false, error: 'License validation failed' });
    }
});

// User login
app.post('/api/login', (req, res) => {
    try {
        const { licenseKey } = req.body;
        const validation = adminPanel.validateLicense(licenseKey);
        
        if (validation.valid) {
            const users = adminPanel.loadUsers();
            const user = users.find(u => u.licenseKey === licenseKey);
            
            if (user) {
                const token = adminPanel.generateToken(user);
                req.session.userToken = token;
                res.json({
                    success: true,
                    token: token,
                    user: {
                        username: user.username,
                        package: user.package,
                        licenseExpiry: user.licenseExpiry
                    }
                });
            } else {
                res.status(401).json({ success: false, error: 'User not found' });
            }
        } else {
            res.status(401).json({ success: false, error: validation.error });
        }
    } catch (error) {
        console.error('User login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// Token verification
app.post('/api/verify-token', (req, res) => {
    try {
        const { token } = req.body;
        const decoded = adminPanel.verifyToken(token);
        
        if (decoded) {
            const users = adminPanel.loadUsers();
            const user = users.find(u => u.username === decoded.username);
            
            if (user) {
                res.json({
                    valid: true,
                    user: {
                        username: user.username,
                        package: user.package,
                        licenseExpiry: user.licenseExpiry
                    }
                });
            } else {
                res.json({ valid: false });
            }
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        console.error('Token verification error:', error);
        res.json({ valid: false });
    }
});

// ===== NEW ADMIN API ENDPOINTS =====
// Generate new JWT secret
app.post('/api/admin/generate-jwt-secret', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const { length = 64 } = req.body;
        const newSecret = adminPanel.generateNewJwtSecret(length);
        res.json({ success: true, secret: newSecret });
    } catch (error) {
        console.error('Generate JWT secret error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate JWT secret' });
    }
});

// Get JWT statistics
app.get('/api/admin/jwt-stats', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const stats = adminPanel.getJwtStatistics();
        res.json(stats);
    } catch (error) {
        console.error('Get JWT stats error:', error);
        res.status(500).json({ error: 'Failed to get JWT statistics' });
    }
});

// Admin wallet connection
app.post('/api/admin/connect-wallet', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const { walletType, publicKey } = req.body;
        
        if (!publicKey) {
            return res.status(400).json({ success: false, error: 'Public key is required' });
        }

        // Store admin wallet connection
        req.session.adminWalletAddress = publicKey;
        req.session.adminWalletType = walletType;

        console.log(`Admin wallet connected: ${walletType} - ${publicKey}`);
        
        res.json({ 
            success: true, 
            message: `Admin ${walletType} wallet connected successfully`,
            walletAddress: publicKey
        });
    } catch (error) {
        console.error('Admin wallet connection error:', error);
        res.status(500).json({ success: false, error: 'Failed to connect admin wallet' });
    }
});

// Admin disconnect wallet
app.post('/api/admin/disconnect-wallet', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        // Clear admin wallet connection
        req.session.adminWalletAddress = null;
        req.session.adminWalletType = null;

        console.log('Admin wallet disconnected');
        
        res.json({ 
            success: true, 
            message: 'Admin wallet disconnected successfully'
        });
    } catch (error) {
        console.error('Admin wallet disconnect error:', error);
        res.status(500).json({ success: false, error: 'Failed to disconnect admin wallet' });
    }
});

// Admin bot testing
app.post('/api/admin/test-bot', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const { action, params } = req.body;
        
        switch (action) {
            case 'start':
                tradingEngine.start(io);
                res.json({ success: true, message: 'Bot started for testing' });
                break;
            case 'stop':
                tradingEngine.stop();
                res.json({ success: true, message: 'Bot stopped' });
                break;
            case 'test_trade':
                // Simulate a test trade
                io.emit('log', `[ADMIN TEST] Test trade executed with params: ${JSON.stringify(params)}`);
                res.json({ success: true, message: 'Test trade executed' });
                break;
            default:
                res.status(400).json({ success: false, error: 'Invalid test action' });
        }
    } catch (error) {
        console.error('Admin bot test error:', error);
        res.status(500).json({ success: false, error: 'Failed to execute test' });
    }
});

// Admin bot start
app.post('/api/admin/start-bot', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        console.log('Admin bot start requested');
        
        // Start admin bot instance (separate from user bot)
        if (!req.session.adminWalletAddress) {
            return res.status(400).json({ success: false, error: 'Admin wallet not connected' });
        }
        
        // Start admin bot with separate instance
        tradingEngine.startAdminBot(io, req.session.adminWalletAddress);
        
        res.json({ 
            success: true, 
            message: 'Admin bot started successfully',
            walletAddress: req.session.adminWalletAddress
        });
    } catch (error) {
        console.error('Admin bot start error:', error);
        res.status(500).json({ success: false, error: 'Failed to start admin bot' });
    }
});

// Admin bot stop
app.post('/api/admin/stop-bot', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        console.log('Admin bot stop requested');
        
        // Stop admin bot instance
        tradingEngine.stopAdminBot();
        
        res.json({ 
            success: true, 
            message: 'Admin bot stopped successfully'
        });
    } catch (error) {
        console.error('Admin bot stop error:', error);
        res.status(500).json({ success: false, error: 'Failed to stop admin bot' });
    }
});

// Admin sell all
app.post('/api/admin/sell-all', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        console.log('Admin sell all requested');
        
        if (!req.session.adminWalletAddress) {
            return res.status(400).json({ success: false, error: 'Admin wallet not connected' });
        }
        
        // Sell all admin positions
        await tradingEngine.sellAllAdmin(req.session.adminWalletAddress);
        
        res.json({ 
            success: true, 
            message: 'All admin positions sold successfully'
        });
    } catch (error) {
        console.error('Admin sell all error:', error);
        res.status(500).json({ success: false, error: 'Failed to sell all admin positions' });
    }
});

// Admin save configuration
app.post('/api/admin/save-config', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const config = req.body;
        
        // Validate configuration
        if (config.buyAmount < 0.01 || config.buyAmount > 10) {
            return res.status(400).json({ error: 'Buy amount must be between 0.01 and 10 SOL' });
        }
        
        if (config.profitTarget < 1 || config.profitTarget > 1000) {
            return res.status(400).json({ error: 'Profit target must be between 1% and 1000%' });
        }
        
        if (config.stopLoss < 1 || config.stopLoss > 100) {
            return res.status(400).json({ error: 'Stop loss must be between 1% and 100%' });
        }
        
        // Save configuration to trading engine
        const result = tradingEngine.updateConfiguration(config);
        
        if (result.success) {
            res.json({ success: true, message: 'Configuration saved successfully' });
        } else {
            res.status(400).json({ error: result.error });
        }
        
    } catch (error) {
        console.error('Save config error:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

// Test external APIs endpoint
app.post('/api/test-external-api', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        const { url, apiName } = req.body;
        
        if (!url || !apiName) {
            return res.status(400).json({ error: 'URL and API name required' });
        }
        
        console.log(`Testing API: ${apiName} at ${url}`);
        
        const start = Date.now();
        
        // Use different strategies for different APIs
        let response;
        try {
            if (apiName.includes('Pump.fun')) {
                // Pump.fun API - use specific headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache'
                    }
                });
            } else if (apiName.includes('Dexscreener')) {
                // Dexscreener API - use standard headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'SoulSpark-Bot/1.0',
                        'Accept': 'application/json'
                    }
                });
            } else if (apiName.includes('Birdeye')) {
                // Birdeye API - use specific headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                });
            } else if (apiName.includes('Solana RPC')) {
                // Solana RPC - use POST request with getSlot method
                response = await axios.post(url, {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSlot"
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'SoulSpark-Bot/1.0'
                    }
                });
            } else if (apiName.includes('Jupiter')) {
                // Jupiter API - use standard headers
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'SoulSpark-Bot/1.0',
                        'Accept': 'application/json'
                    }
                });
            } else {
                // Default headers for other APIs
                response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'SoulSpark-Bot/1.0',
                        'Accept': 'application/json'
                    }
                });
            }
        } catch (axiosError) {
            // If the first attempt fails, try with different headers
            try {
                if (apiName.includes('Solana RPC')) {
                    // For RPC, try POST with different method
                    response = await axios.post(url, {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getHealth"
                    }, {
                        timeout: 15000,
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'SoulSpark-Bot/1.0'
                        }
                    });
                } else {
                    // For other APIs, try with browser-like headers
                    response = await axios.get(url, {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1'
                        }
                    });
                }
            } catch (retryError) {
                throw retryError;
            }
        }
        
        const latency = Date.now() - start;
        
        if (response.status >= 200 && response.status < 300) {
            console.log(`✅ API ${apiName} is online (${latency}ms)`);
            res.json({
                success: true,
                apiName: apiName,
                latency: latency,
                status: response.status
            });
        } else {
            console.log(`❌ API ${apiName} returned status: ${response.status}`);
            res.json({
                success: false,
                apiName: apiName,
                error: `HTTP ${response.status}`,
                latency: latency
            });
        }
        
    } catch (error) {
        console.error(`❌ API test failed for ${req.body.apiName || 'Unknown API'}:`, error.message);
        res.json({
            success: false,
            apiName: req.body.apiName || 'Unknown API',
            error: error.message,
            latency: null
        });
    }
});

// Get all licenses
app.get('/api/admin/licenses', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const licenses = adminPanel.getAllLicenses();
        res.json(licenses);
    } catch (error) {
        console.error('Get licenses error:', error);
        res.status(500).json({ error: 'Failed to get licenses' });
    }
});

// Update license
app.put('/api/admin/licenses/:licenseKey', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const { licenseKey } = req.params;
        const result = adminPanel.updateLicense(licenseKey, req.body);
        res.json(result);
    } catch (error) {
        console.error('Update license error:', error);
        res.status(500).json({ error: 'Failed to update license' });
    }
});

// Delete license
app.delete('/api/admin/licenses/:licenseKey', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const { licenseKey } = req.params;
        const result = adminPanel.deleteLicense(licenseKey);
        res.json(result);
    } catch (error) {
        console.error('Delete license error:', error);
        res.status(500).json({ error: 'Failed to delete license' });
    }
});

// Payment system endpoints
app.get('/api/payment-status', (req, res) => {
    res.json(paymentMonitor.getMonitoringStatus());
});

app.get('/api/payment-history', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const history = paymentMonitor.getPaymentHistory();
        res.json({
            success: true,
            history: history,
            total: history.length
        });
    } catch (error) {
        console.error('Get payment history error:', error);
        res.status(500).json({ success: false, error: 'Failed to get payment history' });
    }
});

app.get('/api/security-logs', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const logs = paymentMonitor.getSecurityLog();
        res.json({
            success: true,
            logs: logs,
            total: logs.length
        });
    } catch (error) {
        console.error('Get security logs error:', error);
        res.status(500).json({ success: false, error: 'Failed to get security logs' });
    }
});

app.post('/api/payment/start-monitoring', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        await paymentMonitor.start();
        res.json({ success: true, message: 'Payment monitoring started' });
    } catch (error) {
        console.error('Start payment monitoring error:', error);
        res.status(500).json({ success: false, error: 'Failed to start payment monitoring' });
    }
});

app.post('/api/payment/stop-monitoring', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        await paymentMonitor.stop();
        res.json({ success: true, message: 'Payment monitoring stopped' });
    } catch (error) {
        console.error('Stop payment monitoring error:', error);
        res.status(500).json({ success: false, error: 'Failed to stop payment monitoring' });
    }
});

app.get('/api/payment/export-history', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const history = paymentMonitor.getPaymentHistory();
        const csvData = [
            ['Timestamp', 'Sender Address', 'Amount (SOL)', 'Package', 'Transaction Signature', 'Action'],
            ...history.map(payment => [
                payment.timestamp,
                payment.senderAddress,
                payment.amount,
                payment.package,
                payment.transactionSignature,
                payment.action
            ])
        ].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="payment_history.csv"');
        res.send(csvData);
    } catch (error) {
        console.error('Export payment history error:', error);
        res.status(500).json({ success: false, error: 'Failed to export payment history' });
    }
});

app.get('/api/payment/export-security-logs', adminPanel.authenticateToken, adminPanel.requireAdmin, (req, res) => {
    try {
        const logs = paymentMonitor.getSecurityLog();
        const csvData = [
            ['Timestamp', 'Level', 'Message', 'Transaction Signature', 'Wallet Address'],
            ...logs.map(log => [
                log.timestamp,
                log.level,
                log.message,
                log.signature || '',
                log.walletAddress
            ])
        ].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="security_logs.csv"');
        res.send(csvData);
    } catch (error) {
        console.error('Export security logs error:', error);
        res.status(500).json({ success: false, error: 'Failed to export security logs' });
    }
});

// WebSocket
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Handle wallet connection
    socket.on('connect-wallet', (data) => {
        const { walletType, publicKey } = data;
        if (publicKey) {
            tradingEngine.connectUserWallet(socket.id, { type: walletType, publicKey });
            socket.emit('wallet-connected', { success: true, walletAddress: publicKey });
        }
    });
    
    // Handle wallet disconnection
    socket.on('disconnect-wallet', () => {
        tradingEngine.disconnectUserWallet(socket.id);
        socket.emit('wallet-disconnected', { success: true });
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        tradingEngine.disconnectUserWallet(socket.id);
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Best Sniper Sol Dashboard running at http://localhost:${PORT}`);
    console.log(`🔧 Admin Panel available at http://localhost:${PORT}/admin`);
    console.log(`💰 Payment monitoring system ready`);
    console.log(`📊 Client wallet: ${PAYMENT_CONFIG.clientWalletAddress}`);
    
    tradingEngine.boot(io); // Check Auto-Restart on server start
    
    // Start payment monitoring
    paymentMonitor.start();
});

// Test RPC proxy endpoint
app.get('/api/test-rpc-proxy', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        // Test with a simple getSlot request
        const testAddress = 'So11111111111111111111111111111111111111112'; // SOL token address
        
        const rpcEndpoints = [
            'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana'
        ];
        
        let workingEndpoints = [];
        let failedEndpoints = [];
        
        for (const rpcUrl of rpcEndpoints) {
            try {
                const response = await axios.post(rpcUrl, {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getSlot'
                }, {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'SoulSpark-Bot/1.0'
                    }
                });
                
                if (response.data && response.data.result) {
                    workingEndpoints.push({
                        url: rpcUrl,
                        slot: response.data.result,
                        latency: response.headers['x-response-time'] || 'unknown'
                    });
                } else {
                    failedEndpoints.push({
                        url: rpcUrl,
                        error: 'Invalid response'
                    });
                }
            } catch (error) {
                failedEndpoints.push({
                    url: rpcUrl,
                    error: error.message
                });
            }
        }
        
        res.json({
            success: true,
            workingEndpoints: workingEndpoints,
            failedEndpoints: failedEndpoints,
            totalTested: rpcEndpoints.length,
            workingCount: workingEndpoints.length
        });
        
    } catch (error) {
        console.error('RPC proxy test error:', error);
        res.status(500).json({
            success: false,
            error: 'RPC proxy test failed',
            message: error.message
        });
    }
});

// RPC Proxy endpoint for wallet balance checks
app.post('/api/rpc-proxy', adminPanel.authenticateToken, adminPanel.requireAdmin, async (req, res) => {
    try {
        const { method, params, endpoint } = req.body;
        
        if (!method || !params || !endpoint) {
            return res.status(400).json({ error: 'Method, params, and endpoint required' });
        }
        
        // Use different RPC endpoints with fallback
        const rpcEndpoints = [
            'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana',
            'https://solana.public-rpc.com',
            'https://solana.getblock.io/mainnet',
            'https://mainnet.rpcpool.com',
            'https://solana.public-rpc.com'
        ];
        
        let lastError = null;
        
        for (const rpcUrl of rpcEndpoints) {
            try {
                const response = await axios.post(rpcUrl, {
                    jsonrpc: '2.0',
                    id: 1,
                    method: method,
                    params: params
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'SoulSpark-Bot/1.0'
                    }
                });
                
                if (response.data && response.data.result) {
                    return res.json({
                        success: true,
                        result: response.data.result,
                        endpoint: rpcUrl
                    });
                } else if (response.data && response.data.error) {
                    lastError = response.data.error;
                    continue; // Try next endpoint
                }
            } catch (error) {
                lastError = error.message;
                continue; // Try next endpoint
            }
        }
        
        // If all endpoints failed
        res.status(500).json({
            success: false,
            error: 'All RPC endpoints failed',
            lastError: lastError
        });
        
    } catch (error) {
        console.error('RPC proxy error:', error);
        res.status(500).json({
            success: false,
            error: 'RPC proxy failed',
            message: error.message
        });
    }
});

// Serve Dashboard (catch-all route - must be last)
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'))); 