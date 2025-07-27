import axios from 'axios';
import fs from 'fs';
import bs58 from 'bs58';
import { Keypair, Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { AccountLayout } from '@solana/spl-token';
import 'dotenv/config';

const SOLANA_WALLET_PATH = process.env.SOLANA_WALLET_PATH || './wallet/id.json';
const STATE_FILE = './botState.json';
const WALLET_FILE = SOLANA_WALLET_PATH;

let userKey = null;
let payer = null;
let walletLoaded = false;
let connectedWallets = new Map(); // Store connected user wallets
let tradingProfits = new Map(); // Store profits for each user

function tryLoadWallet() {
  try {
    if (!fs.existsSync(WALLET_FILE)) return false;
    const keyData = fs.readFileSync(WALLET_FILE, 'utf8');
    const parsed = JSON.parse(keyData);
    if (Array.isArray(parsed)) {
      userKey = Uint8Array.from(parsed);
      payer = Keypair.fromSecretKey(userKey);
      walletLoaded = true;
      return true;
    }
    return false;
  } catch (e) {
    walletLoaded = false;
    return false;
  }
}

tryLoadWallet();

const connection = new Connection(clusterApiUrl('mainnet-beta'));

let ioClient = null;
let running = false;
let autoRestart = false;
let settings = {
  randomBuy: true,
  buyMin: 0.1,
  buyMax: 0.2,
  fixedBuy: 0.1,
  profit1: 25,
  profit2: 50,
  stop: 10,
  liquidity: 1000,
  rugcheck: 'skip',
  priceInterval: 5000,
  monitorInterval: 5000,
  timeoutMinutes: 5
};

// Load state if exists
if (fs.existsSync(STATE_FILE)) {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE));
    autoRestart = state.autoRestart || false;
    settings = { ...settings, ...state.settings };
  } catch {
    console.log('No previous bot state found.');
  }
}

// Save state
const saveState = () => {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ running, autoRestart, settings }, null, 2));
};

// Emit logs
const log = (msg) => {
  console.log(msg);
  if (ioClient) ioClient.emit('log', `[${new Date().toLocaleTimeString()}] ${msg}`);
};

// Wallet management functions
const connectUserWallet = (userId, walletInfo) => {
  connectedWallets.set(userId, walletInfo);
  log(`User ${userId} wallet connected: ${walletInfo.publicKey}`);
  return true;
};

const disconnectUserWallet = (userId) => {
  connectedWallets.delete(userId);
  log(`User ${userId} wallet disconnected`);
  return true;
};

const getUserWallet = (userId) => {
  return connectedWallets.get(userId);
};

const addTradingProfit = (userId, amount) => {
  const currentProfit = tradingProfits.get(userId) || 0;
  tradingProfits.set(userId, currentProfit + amount);
  log(`Added ${amount} SOL profit for user ${userId}. Total: ${currentProfit + amount} SOL`);
};

const getTradingProfit = (userId) => {
  return tradingProfits.get(userId) || 0;
};

const distributeProfits = async (userId) => {
  const profit = getTradingProfit(userId);
  const wallet = getUserWallet(userId);
  
  if (!wallet || profit <= 0) {
    return { success: false, message: 'No wallet connected or no profits to distribute' };
  }
  
  try {
    // Here you would implement the actual profit distribution logic
    // For now, we'll simulate it
    log(`Distributing ${profit} SOL to user ${userId} wallet: ${wallet.publicKey}`);
    
    // Reset profit after distribution
    tradingProfits.set(userId, 0);
    
    return { 
      success: true, 
      message: `Distributed ${profit} SOL to wallet ${wallet.publicKey}`,
      amount: profit
    };
  } catch (error) {
    log(`Profit distribution failed for user ${userId}: ${error.message}`);
    return { success: false, message: 'Profit distribution failed' };
  }
};

// Wallet helper (for admin wallet if needed)
const fetchSPLTokens = async () => {
  if (!walletLoaded) return [];
  try {
    const accounts = await connection.getTokenAccountsByOwner(
      payer.publicKey,
      { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
    );
    return accounts.value.map(info => {
      const d = AccountLayout.decode(info.account.data);
      return { mint: new PublicKey(d.mint).toString(), amount: Number(d.amount) / 1e6 };
    }).filter(t => t.amount > 0);
  } catch (e) {
    log(`Token fetch error: ${e.message}`);
    return [];
  }
};

// Rugcheck
const rugCheck = async (mint) => {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const token = res.data.pairs?.[0];
    
    if (!token) return ['No liquidity'];
    
    const issues = [];
    if (token.liquidity?.usd < settings.liquidity) issues.push('Low liquidity');
    if (token.priceChange?.h24 < -settings.stop) issues.push('High volatility');
    
    return issues;
  } catch (e) {
    return ['API error'];
  }
};

// Trading functions (simplified for demo)
const pumpFunTrade = async (type, mint, amount) => {
  try {
    // Simulate trading for demo purposes
    const txId = Math.random().toString(36).substring(2, 15);
    log(`Simulated ${type} trade: ${amount} SOL for ${mint} (Tx: ${txId})`);
    
    // Simulate profit for connected users
    if (type === 'sell' && connectedWallets.size > 0) {
      const profitPerUser = (amount * 0.1) / connectedWallets.size; // 10% profit split among users
      connectedWallets.forEach((wallet, userId) => {
        addTradingProfit(userId, profitPerUser);
      });
    }
    
    return txId;
  } catch (e) {
    log(`Trade error: ${e.message}`);
    return null;
  }
};

const monitorAndSell = async (mint, buyPrice) => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < settings.timeoutMinutes * 60000) {
    try {
      const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const token = res.data.pairs?.[0];
      
      if (!token) {
        log(`Token ${mint} not found, selling`);
        await pumpFunTrade('sell', mint, 0.1);
        break;
      }
      
      const currentPrice = parseFloat(token.priceUsd || '0');
      const priceChange = ((currentPrice - buyPrice) / buyPrice) * 100;
      
      if (priceChange >= settings.profit1 || priceChange <= -settings.stop) {
        log(`Selling ${mint} at ${priceChange.toFixed(2)}% change`);
        await pumpFunTrade('sell', mint, 0.1);
        break;
      }
      
      await new Promise(r => setTimeout(r, settings.priceInterval));
    } catch (e) {
      log(`Monitor error: ${e.message}`);
      break;
    }
  }
};

const tradeLoop = async () => {
  // Remove wallet requirement - bot can run without wallet
  log('Starting trading bot...');
  
  while (running) {
    const dexPairs = await axios.get("https://api.dexscreener.com/latest/dex/pairs/solana")
      .then(r => r.data.pairs || []).catch(() => []);
    
    const pumpPairs = await axios.get("https://pumpapi.fun/api/get_newer_mints", { params: { limit: 5 } })
      .then(r => r.data.mint || []).catch(() => []);
    
    const tokens = [
      ...pumpPairs.map(mint => ({ source: 'Pump.fun', mint, price: 0 })),
      ...dexPairs.filter(p => p.pairCreatedAt && Date.now() - p.pairCreatedAt < 2 * 60000)
                .map(p => ({ source: 'Dex', mint: p.baseToken.address, price: parseFloat(p.priceUsd || '0') }))
    ];
    
    for (const token of tokens) {
      const issues = await rugCheck(token.mint);
      if (issues.length && settings.rugcheck === 'skip') {
        log(`Skipping ${token.mint}: ${issues.join(', ')}`); 
        continue;
      }
      
      const buyAmount = settings.randomBuy ?
        (Math.random() * (settings.buyMax - settings.buyMin) + settings.buyMin) :
        settings.fixedBuy;
      
      log(`Buying ${token.source} token ${token.mint} (${buyAmount} SOL)`);
      const tx = await pumpFunTrade('buy', token.mint, buyAmount);
      
      if (!tx) { 
        log(`Buy failed ${token.mint}`); 
        continue; 
      }
      
      log(`Bought ${token.mint}. Tx:${tx}`);
      await monitorAndSell(token.mint, token.price || 0);
    }
    
    await new Promise(r => setTimeout(r, settings.monitorInterval));
  }
  saveState();
};

// Public API
export default {
  boot: (io) => {
    ioClient = io;
    tryLoadWallet();
    if (autoRestart) {
      running = true;
      tradeLoop();
      log('Bot auto-restarted after reboot');
    }
  },
  start: (io) => { 
    // Remove wallet requirement - bot can start without wallet
    if (!running) { 
      running = true; 
      ioClient = io; 
      tradeLoop(); 
      log('Bot started successfully'); 
      saveState(); 
    } 
  },
  stop: () => { 
    running = false; 
    log('Bot stopped'); 
    saveState(); 
  },
  sellAll: async () => {
    if (!walletLoaded) {
      log('Admin wallet not loaded for sell all operation');
      return;
    }
    const tokens = await fetchSPLTokens();
    for (const token of tokens) {
      const tx = await pumpFunTrade('sell', token.mint, token.amount);
      log(tx ? `Sold all ${token.mint} Tx:${tx}` : `Sell failed ${token.mint}`);
    }
  },
  updateSettings: (s) => { 
    settings = { ...settings, ...s }; 
    log(`Settings updated`); 
    saveState(); 
  },
  getSettings: () => settings,
  getStatus: () => ({ 
    running, 
    autoRestart, 
    settings, 
    walletLoaded,
    connectedUsers: connectedWallets.size,
    totalProfits: Array.from(tradingProfits.values()).reduce((sum, profit) => sum + profit, 0)
  }),
  setAutoRestart: (enabled) => { 
    autoRestart = enabled; 
    log(`Auto-Restart ${enabled ? 'enabled' : 'disabled'}`); 
    saveState(); 
  },
  getAutoRestart: () => autoRestart,
  
  // New wallet management functions
  connectUserWallet,
  disconnectUserWallet,
  getUserWallet,
  addTradingProfit,
  getTradingProfit,
  distributeProfits,
  getConnectedWallets: () => Array.from(connectedWallets.entries()),
  getTradingProfits: () => Array.from(tradingProfits.entries())
}; 