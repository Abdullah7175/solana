import express from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import tradingEngine from './tradingEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session management for wallet connections
app.use(session({
  secret: 'soul-spark-trading-bot-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is working properly',
    timestamp: new Date().toISOString()
  });
});

// API Endpoints
app.get('/api/status', (req, res) => res.json(tradingEngine.getStatus()));

// Wallet status endpoint (for browser-based wallets)
app.get('/api/wallet-status', (req, res) => {
  res.json({ 
    walletLoaded: false, 
    message: 'Please connect your wallet using the browser extension',
    requiresBrowserWallet: true 
  });
});

// Wallet connection endpoint for browser-based wallets
app.post('/api/connect-wallet', (req, res) => {
  const { walletType, publicKey, signature } = req.body;
  
  if (!publicKey) {
    return res.status(400).json({ error: 'Missing wallet public key' });
  }
  
  try {
    // Generate a simple user ID (in production, use proper user authentication)
    const userId = req.sessionID || Math.random().toString(36).substring(2, 15);
    
    // Store wallet info in session
    req.session = req.session || {};
    req.session.walletInfo = {
      type: walletType,
      publicKey: publicKey,
      connected: true,
      connectedAt: new Date().toISOString()
    };
    
    // Connect wallet in trading engine
    tradingEngine.connectUserWallet(userId, req.session.walletInfo);
    
    console.log(`Wallet connected: ${walletType} - ${publicKey}`);
    
    res.json({ 
      success: true, 
      message: 'Wallet connected successfully',
      walletType,
      publicKey,
      connected: true,
      userId
    });
  } catch (error) {
    console.error('Wallet connection error:', error);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
});

// Get connected wallet info
app.get('/api/connected-wallet', (req, res) => {
  const session = req.session || {};
  const walletInfo = session.walletInfo;
  
  if (walletInfo && walletInfo.connected) {
    const userId = req.sessionID || 'default';
    const profit = tradingEngine.getTradingProfit(userId);
    
    res.json({
      connected: true,
      walletType: walletInfo.type,
      publicKey: walletInfo.publicKey,
      connectedAt: walletInfo.connectedAt,
      profit: profit
    });
  } else {
    res.json({
      connected: false,
      message: 'No wallet connected'
    });
  }
});

// Disconnect wallet endpoint
app.post('/api/disconnect-wallet', (req, res) => {
  try {
    const userId = req.sessionID || 'default';
    tradingEngine.disconnectUserWallet(userId);
    
    // Clear session
    req.session.walletInfo = null;
    
    res.json({ 
      success: true, 
      message: 'Wallet disconnected successfully'
    });
  } catch (error) {
    console.error('Wallet disconnection error:', error);
    res.status(500).json({ error: 'Failed to disconnect wallet' });
  }
});

// Distribute profits endpoint
app.post('/api/distribute-profits', async (req, res) => {
  try {
    const userId = req.sessionID || 'default';
    const result = await tradingEngine.distributeProfits(userId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        amount: result.amount
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Profit distribution error:', error);
    res.status(500).json({ error: 'Failed to distribute profits' });
  }
});

// Trading stats endpoint
app.get('/api/trading-stats', (req, res) => {
  const status = tradingEngine.getStatus();
  const connectedWallets = tradingEngine.getConnectedWallets();
  const tradingProfits = tradingEngine.getTradingProfits();
  
  res.json({
    botStatus: {
      running: status.running,
      connectedUsers: status.connectedUsers,
      totalProfits: status.totalProfits
    },
    connectedWallets: connectedWallets.map(([userId, wallet]) => ({
      userId,
      publicKey: wallet.publicKey,
      type: wallet.type
    })),
    profits: tradingProfits.map(([userId, profit]) => ({
      userId,
      profit
    }))
  });
});

// System metrics endpoint
app.get('/api/system-metrics', (req, res) => {
  // Simulate system metrics
  res.json({
    cpu: (Math.random() * 30 + 40).toFixed(1),
    memory: Math.floor(Math.random() * 50 + 150),
    networkLatency: (Math.random() * 5 + 8).toFixed(1),
    buyTime: `${(Math.random() * 0.1).toFixed(2)}s - ${(Math.random() * 0.1).toFixed(2)}s`
  });
});

// Trading data endpoint
app.get('/api/trading-data', (req, res) => {
  // Simulate trading data
  const baseTime = new Date();
  const tradingData = [];
  
  for (let i = 0; i < 6; i++) {
    const time = new Date(baseTime.getTime() - (i * 5000));
    tradingData.push({
      name: 'New Token (NEW)',
      symbol: 'new...token',
      address: '8bXf8Rg3u4Prz71LgKR5mpa7aMe2F4cSKYYRctmqro6x',
      launch: time.toLocaleTimeString(),
      speed: (Math.random() * 0.1).toFixed(2),
      status: 'BUYING...'
    });
  }
  
  res.json(tradingData);
});

// Launch bot endpoint (NO WALLET REQUIRED)
app.post('/api/launch-bot', (req, res) => {
  const { parameters } = req.body;
  
  try {
    // Start the trading bot
    tradingEngine.start(io);
    
    // Simulate bot launch
    setTimeout(() => {
      res.json({ 
        success: true, 
        message: 'Trading bot launched successfully',
        parameters 
      });
    }, 1000);
  } catch (error) {
    console.error('Bot launch error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to launch bot: ' + error.message 
    });
  }
});

// Start bot endpoint (NO WALLET REQUIRED)
app.post('/api/start', (req, res) => { 
  try {
    // Start trading bot without wallet requirement
    tradingEngine.start(io); 
    res.json({ 
      started: true, 
      message: 'Trading bot started successfully'
    }); 
  } catch (error) {
    console.error('Start bot error:', error);
    res.status(500).json({ 
      started: false, 
      error: 'Failed to start bot: ' + error.message 
    });
  }
});

// Stop bot endpoint
app.post('/api/stop', (req, res) => { 
  try {
    tradingEngine.stop(); 
    res.json({ stopped: true }); 
  } catch (error) {
    console.error('Stop bot error:', error);
    res.status(500).json({ 
      stopped: false, 
      error: 'Failed to stop bot: ' + error.message 
    });
  }
});

// Stop bot endpoint (alternative)
app.post('/api/stop-bot', (req, res) => {
  try {
    tradingEngine.stop();
    res.json({ 
      success: true, 
      message: 'Trading bot stopped successfully' 
    });
  } catch (error) {
    console.error('Stop bot error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to stop bot: ' + error.message 
    });
  }
});

// Sell all endpoint (requires wallet)
app.post('/api/sell-all', async (req, res) => { 
  try {
    // Check if wallet is connected via browser
    const session = req.session || {};
    const walletInfo = session.walletInfo;
    
    if (!walletInfo || !walletInfo.connected) {
      return res.status(400).json({ 
        error: 'Wallet not connected. Please connect your wallet using the browser extension.' 
      });
    }
    
    await tradingEngine.sellAll(walletInfo.publicKey); 
    res.json({ 
      soldAll: true, 
      walletAddress: walletInfo.publicKey,
      message: 'All tokens sold from connected wallet'
    }); 
  } catch (error) {
    console.error('Sell all error:', error);
    res.status(500).json({ 
      soldAll: false, 
      error: 'Failed to sell all: ' + error.message 
    });
  }
});

// Settings endpoints
app.post('/api/settings', (req, res) => {
  try {
    tradingEngine.updateSettings(req.body);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update settings: ' + error.message 
    });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    res.json(tradingEngine.getSettings());
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ 
      error: 'Failed to get settings: ' + error.message 
    });
  }
});

// Safety settings endpoints
app.post('/api/safety-settings', (req, res) => {
  try {
    const safetySettings = {
      top10HoldersMax: parseInt(req.body.top10HoldersMax) || 50,
      bundledMax: parseInt(req.body.bundledMax) || 20,
      maxSameBlockBuys: parseInt(req.body.maxSameBlockBuys) || 3,
      safetyCheckPeriod: parseInt(req.body.safetyCheckPeriod) || 30,
      requireSocials: req.body.requireSocials !== undefined ? req.body.requireSocials : true,
      requireLiquidityBurnt: req.body.requireLiquidityBurnt !== undefined ? req.body.requireLiquidityBurnt : true,
      requireImmutableMetadata: req.body.requireImmutableMetadata !== undefined ? req.body.requireImmutableMetadata : true,
      requireMintAuthorityRenounced: req.body.requireMintAuthorityRenounced !== undefined ? req.body.requireMintAuthorityRenounced : true,
      requireFreezeAuthorityRenounced: req.body.requireFreezeAuthorityRenounced !== undefined ? req.body.requireFreezeAuthorityRenounced : true,
      onlyPumpFunMigrated: req.body.onlyPumpFunMigrated !== undefined ? req.body.onlyPumpFunMigrated : true,
      minPoolSize: parseInt(req.body.minPoolSize) || 5000
    };
    
    tradingEngine.updateSafetySettings(safetySettings);
    res.json({ success: true, message: 'Safety settings updated successfully' });
  } catch (error) {
    console.error('Safety settings update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update safety settings: ' + error.message 
    });
  }
});

app.get('/api/safety-settings', (req, res) => {
  try {
    res.json(tradingEngine.getSafetySettings());
  } catch (error) {
    console.error('Get safety settings error:', error);
    res.status(500).json({ 
      error: 'Failed to get safety settings: ' + error.message 
    });
  }
});

// Auto restart endpoints
app.post('/api/auto-restart', (req, res) => {
  try {
    const { enabled } = req.body;
    tradingEngine.setAutoRestart(enabled);
    res.json({ 
      success: true, 
      message: `Auto-restart ${enabled ? 'enabled' : 'disabled'}` 
    });
  } catch (error) {
    console.error('Auto restart error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update auto-restart: ' + error.message 
    });
  }
});

app.get('/api/auto-restart', (req, res) => {
  try {
    res.json({ enabled: tradingEngine.getAutoRestart() });
  } catch (error) {
    console.error('Get auto restart error:', error);
    res.status(500).json({ 
      error: 'Failed to get auto-restart status: ' + error.message 
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start Server
const PORT = process.env.PORT || 80;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 soul spark Dashboard running at http://0.0.0.0:${PORT}`);
  console.log(`🌐 Access from internet: http://YOUR_DROPLET_IP:${PORT}`);
  tradingEngine.boot(io); // Check Auto-Restart on server start
}); 