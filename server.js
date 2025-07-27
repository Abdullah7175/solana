import express from 'express';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import tradingEngine from './tradingEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoints
app.get('/api/status', (req, res) => res.json(tradingEngine.getStatus()));

// Wallet upload and status endpoints
app.get('/api/wallet-status', (req, res) => {
  res.json(tradingEngine.walletStatus());
});
app.post('/api/wallet', (req, res) => {
  const { walletJson } = req.body;
  if (!walletJson) return res.status(400).json({ error: 'Missing walletJson' });
  const ok = tradingEngine.setWallet(walletJson);
  if (ok) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to save wallet' });
});

// New endpoints for robust frontend
app.post('/api/connect-wallet', (req, res) => {
  const { walletType } = req.body;
  // Simulate wallet connection
  setTimeout(() => {
    res.json({ 
      success: true, 
      walletType,
      address: '8bXf8Rg3u4Prz71LgKR5mpa7aMe2F4cSKYYRctmqro6x',
      balance: '8.32 SOL'
    });
  }, 1000);
});

app.get('/api/system-metrics', (req, res) => {
  // Simulate system metrics
  res.json({
    cpu: (Math.random() * 30 + 40).toFixed(1),
    memory: Math.floor(Math.random() * 50 + 150),
    networkLatency: (Math.random() * 5 + 8).toFixed(1),
    buyTime: `${(Math.random() * 0.1).toFixed(2)}s - ${(Math.random() * 0.1).toFixed(2)}s`
  });
});

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

app.post('/api/launch-bot', (req, res) => {
  const { parameters } = req.body;
  // Simulate bot launch
  setTimeout(() => {
    res.json({ 
      success: true, 
      message: 'Trading bot launched successfully',
      parameters 
    });
  }, 3000);
});

app.post('/api/stop-bot', (req, res) => {
  // Simulate bot stop
  res.json({ 
    success: true, 
    message: 'Trading bot stopped successfully' 
  });
});

app.post('/api/start', (req, res) => { 
  if (!tradingEngine.walletStatus().walletLoaded) {
    return res.status(400).json({ error: 'Wallet not loaded. Please upload or set your wallet.' });
  }
  tradingEngine.start(io); 
  res.json({ started: true }); 
});
app.post('/api/stop', (req, res) => { tradingEngine.stop(); res.json({ stopped: true }); });
app.post('/api/sell-all', async (req, res) => { 
  if (!tradingEngine.walletStatus().walletLoaded) {
    return res.status(400).json({ error: 'Wallet not loaded. Please upload or set your wallet.' });
  }
  await tradingEngine.sellAll(); res.json({ soldAll: true }); 
});
app.post('/api/settings', (req, res) => {
  tradingEngine.updateSettings(req.body);
  res.json({ settings: tradingEngine.getSettings() });
});
app.post('/api/auto-restart', (req, res) => {
  tradingEngine.setAutoRestart(req.body.enabled);
  res.json({ autoRestart: tradingEngine.getAutoRestart() });
});

// Serve Dashboard
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// WebSocket
io.on('connection', (socket) => {
  tradingEngine.attachClient(socket);
  socket.on('disconnect', () => tradingEngine.detachClient(socket));
  
  // Handle custom events for the robust frontend
  socket.on('launch-bot', (data) => {
    console.log('Launch bot requested:', data);
    // Emit trading initialization
    socket.emit('trading-initialized', { success: true });
  });
  
  socket.on('connect-wallet', (walletType) => {
    console.log('Wallet connection requested:', walletType);
    // Emit wallet connected
    socket.emit('wallet-connected', { 
      walletType, 
      address: '8bXf8Rg3u4Prz71LgKR5mpa7aMe2F4cSKYYRctmqro6x',
      balance: '8.32 SOL'
    });
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 soul spark Dashboard running at http://localhost:${PORT}`);
  tradingEngine.boot(io); // Check Auto-Restart on server start
}); 