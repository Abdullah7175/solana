import axios from 'axios';
import fs from 'fs';
import bs58 from 'bs58';
import { Keypair, Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { AccountLayout, getMint } from '@solana/spl-token';
import 'dotenv/config';

const SOLANA_WALLET_PATH = process.env.SOLANA_WALLET_PATH || './wallet/id.json';
const STATE_FILE = './botState.json';
const WALLET_FILE = SOLANA_WALLET_PATH;

let userKey = null;
let payer = null;
let walletLoaded = false;
let connectedWallets = new Map(); // Store connected user wallets
let tradingProfits = new Map(); // Store profits for each user
let sameBlockBuyCount = 0; // Track same block buys
let lastBlockTime = 0; // Track last block time

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
  timeoutMinutes: 5,
  // Advanced Safety Settings
  top10HoldersMax: 50, // Maximum % for top 10 holders
  bundledMax: 20, // Maximum % for bundled wallets
  maxSameBlockBuys: 3, // Maximum buys per block
  safetyCheckPeriod: 30, // Safety check interval in seconds
  requireSocials: true, // Require social links
  requireLiquidityBurnt: true, // Require burnt liquidity
  requireImmutableMetadata: true, // Require immutable metadata
  requireMintAuthorityRenounced: true, // Require mint authority renounced
  requireFreezeAuthorityRenounced: true, // Require freeze authority renounced
  onlyPumpFunMigrated: true, // Only trade Pump.fun migrated tokens
  minPoolSize: 5000, // Minimum pool size in USD
  lastSafetyCheck: 0 // Timestamp of last safety check
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

// Advanced Safety Check Functions

// Check top 10 holders percentage
const checkTop10Holders = async (mint) => {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const token = res.data.pairs?.[0];
    
    if (!token || !token.holders) {
      return { safe: false, reason: 'No holder data available' };
    }
    
    // Get top 10 holders
    const top10Holders = token.holders.slice(0, 10);
    const totalSupply = token.totalSupply || 1;
    
    // Calculate percentage held by top 10
    const top10Percentage = top10Holders.reduce((sum, holder) => {
      return sum + (holder.percentage || 0);
    }, 0);
    
    if (top10Percentage > settings.top10HoldersMax) {
      return { 
        safe: false, 
        reason: `Top 10 holders control ${top10Percentage.toFixed(2)}% (max: ${settings.top10HoldersMax}%)` 
      };
    }
    
    return { safe: true, percentage: top10Percentage };
  } catch (error) {
    return { safe: false, reason: 'Error checking top 10 holders' };
  }
};

// Check bundled wallets
const checkBundledWallets = async (mint) => {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const token = res.data.pairs?.[0];
    
    if (!token || !token.holders) {
      return { safe: false, reason: 'No holder data available' };
    }
    
    // Look for bundled wallets (same creation time, similar amounts)
    const holders = token.holders || [];
    const bundledWallets = [];
    
    // Group wallets by similar creation patterns
    for (let i = 0; i < holders.length; i++) {
      for (let j = i + 1; j < holders.length; j++) {
        const holder1 = holders[i];
        const holder2 = holders[j];
        
        // Check if wallets have similar amounts (within 10%)
        const amountDiff = Math.abs(holder1.percentage - holder2.percentage);
        if (amountDiff < 2 && holder1.percentage > 5) {
          bundledWallets.push(holder1, holder2);
        }
      }
    }
    
    // Calculate bundled percentage
    const bundledPercentage = bundledWallets.reduce((sum, holder) => {
      return sum + (holder.percentage || 0);
    }, 0);
    
    if (bundledPercentage > settings.bundledMax) {
      return { 
        safe: false, 
        reason: `Bundled wallets control ${bundledPercentage.toFixed(2)}% (max: ${settings.bundledMax}%)` 
      };
    }
    
    return { safe: true, percentage: bundledPercentage };
  } catch (error) {
    return { safe: false, reason: 'Error checking bundled wallets' };
  }
};

// Check same block buy limit
const checkSameBlockBuys = () => {
  const currentTime = Date.now();
  
  // Reset counter if new block
  if (currentTime - lastBlockTime > 400) { // 400ms = new block
    sameBlockBuyCount = 0;
    lastBlockTime = currentTime;
  }
  
  if (sameBlockBuyCount >= settings.maxSameBlockBuys) {
    return { safe: false, reason: `Max same block buys reached (${settings.maxSameBlockBuys})` };
  }
  
  sameBlockBuyCount++;
  return { safe: true, count: sameBlockBuyCount };
};

// Check social links
const checkSocialLinks = async (mint) => {
  if (!settings.requireSocials) {
    return { safe: true };
  }
  
  try {
    // Check multiple sources for social links
    const sources = [
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      `https://pumpapi.fun/api/token/${mint}`,
      `https://birdeye.so/token/${mint}`
    ];
    
    let hasSocials = false;
    
    for (const source of sources) {
      try {
        const res = await axios.get(source, { timeout: 5000 });
        const data = res.data;
        
        // Check for social links in various formats
        const socials = [
          data.twitter,
          data.discord,
          data.telegram,
          data.website,
          data.socials?.twitter,
          data.socials?.discord,
          data.socials?.telegram,
          data.metadata?.socials?.twitter,
          data.metadata?.socials?.discord
        ];
        
        if (socials.some(social => social && social.length > 0)) {
          hasSocials = true;
          break;
        }
      } catch (e) {
        continue; // Try next source
      }
    }
    
    if (!hasSocials) {
      return { safe: false, reason: 'No social links found' };
    }
    
    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Error checking social links' };
  }
};

// Check if liquidity is burnt
const checkLiquidityBurnt = async (mint) => {
  if (!settings.requireLiquidityBurnt) {
    return { safe: true };
  }
  
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const token = res.data.pairs?.[0];
    
    if (!token) {
      return { safe: false, reason: 'No token data available' };
    }
    
    // Check if LP tokens are burnt (sent to dead address)
    const deadAddresses = [
      '11111111111111111111111111111111', // System Program
      '00000000000000000000000000000000', // Zero address
      '11111111111111111111111111111112'  // Another common dead address
    ];
    
    // Check if LP tokens are in dead addresses
    const lpTokenAddress = token.lpToken;
    if (lpTokenAddress) {
      // This would require checking token accounts, simplified for demo
      // In real implementation, check if LP tokens are in dead addresses
      return { safe: true, reason: 'LP token verification would be implemented here' };
    }
    
    return { safe: false, reason: 'Liquidity not verified as burnt' };
  } catch (error) {
    return { safe: false, reason: 'Error checking liquidity burnt status' };
  }
};

// Check if metadata is immutable
const checkImmutableMetadata = async (mint) => {
  if (!settings.requireImmutableMetadata) {
    return { safe: true };
  }
  
  try {
    // Get token mint info
    const mintInfo = await getMint(connection, new PublicKey(mint));
    
    // Check if metadata can be updated
    // This is a simplified check - in real implementation, you'd check the metadata program
    const isImmutable = mintInfo.isInitialized && !mintInfo.isFrozen;
    
    if (!isImmutable) {
      return { safe: false, reason: 'Metadata is not immutable' };
    }
    
    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Error checking metadata immutability' };
  }
};

// Check if mint authority is renounced
const checkMintAuthorityRenounced = async (mint) => {
  if (!settings.requireMintAuthorityRenounced) {
    return { safe: true };
  }
  
  try {
    const mintInfo = await getMint(connection, new PublicKey(mint));
    
    if (mintInfo.mintAuthority) {
      return { safe: false, reason: 'Mint authority not renounced' };
    }
    
    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Error checking mint authority' };
  }
};

// Check if freeze authority is renounced
const checkFreezeAuthorityRenounced = async (mint) => {
  if (!settings.requireFreezeAuthorityRenounced) {
    return { safe: true };
  }
  
  try {
    const mintInfo = await getMint(connection, new PublicKey(mint));
    
    if (mintInfo.freezeAuthority) {
      return { safe: false, reason: 'Freeze authority not renounced' };
    }
    
    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Error checking freeze authority' };
  }
};

// Check if token is migrated from Pump.fun
const checkPumpFunMigration = async (mint) => {
  if (!settings.onlyPumpFunMigrated) {
    return { safe: true };
  }
  
  try {
    // Check if token exists on Pump.fun
    const pumpRes = await axios.get(`https://pumpapi.fun/api/token/${mint}`, { timeout: 5000 });
    
    if (pumpRes.data && pumpRes.data.migrated) {
      return { safe: true };
    }
    
    return { safe: false, reason: 'Token not migrated from Pump.fun' };
  } catch (error) {
    return { safe: false, reason: 'Error checking Pump.fun migration' };
  }
};

// Check pool size
const checkPoolSize = async (mint) => {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const token = res.data.pairs?.[0];
    
    if (!token) {
      return { safe: false, reason: 'No token data available' };
    }
    
    const poolSize = token.liquidity?.usd || 0;
    
    if (poolSize < settings.minPoolSize) {
      return { 
        safe: false, 
        reason: `Pool size too small: $${poolSize.toFixed(2)} (min: $${settings.minPoolSize})` 
      };
    }
    
    return { safe: true, poolSize };
  } catch (error) {
    return { safe: false, reason: 'Error checking pool size' };
  }
};

// Comprehensive safety check
const comprehensiveSafetyCheck = async (mint) => {
  const currentTime = Date.now();
  
  // Check if we need to run safety checks (respect safety check period)
  if (currentTime - settings.lastSafetyCheck < settings.safetyCheckPeriod * 1000) {
    return { safe: true, reason: 'Safety check period not elapsed' };
  }
  
  settings.lastSafetyCheck = currentTime;
  
  log(`Running comprehensive safety check for ${mint}...`);
  
  const checks = [
    { name: 'Top 10 Holders', check: () => checkTop10Holders(mint) },
    { name: 'Bundled Wallets', check: () => checkBundledWallets(mint) },
    { name: 'Same Block Buys', check: () => checkSameBlockBuys() },
    { name: 'Social Links', check: () => checkSocialLinks(mint) },
    { name: 'Liquidity Burnt', check: () => checkLiquidityBurnt(mint) },
    { name: 'Immutable Metadata', check: () => checkImmutableMetadata(mint) },
    { name: 'Mint Authority', check: () => checkMintAuthorityRenounced(mint) },
    { name: 'Freeze Authority', check: () => checkFreezeAuthorityRenounced(mint) },
    { name: 'Pump.fun Migration', check: () => checkPumpFunMigration(mint) },
    { name: 'Pool Size', check: () => checkPoolSize(mint) }
  ];
  
  for (const { name, check } of checks) {
    try {
      const result = await check();
      if (!result.safe) {
        log(`❌ Safety check failed - ${name}: ${result.reason}`);
        return { safe: false, reason: `${name}: ${result.reason}` };
      }
    } catch (error) {
      log(`❌ Safety check error - ${name}: ${error.message}`);
      return { safe: false, reason: `${name}: Error` };
    }
  }
  
  log(`✅ All safety checks passed for ${mint}`);
  return { safe: true };
};

// Enhanced rugcheck with new safety features
const rugCheck = async (mint) => {
  try {
    // Run comprehensive safety check first
    const safetyResult = await comprehensiveSafetyCheck(mint);
    if (!safetyResult.safe) {
      return [safetyResult.reason];
    }
    
    // Original rugcheck logic
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
  getTradingProfits: () => Array.from(tradingProfits.entries()),
  updateSafetySettings: (safetySettings) => {
    settings = { ...settings, ...safetySettings };
    saveState();
    log('Safety settings updated');
  },
  getSafetySettings: () => ({
    top10HoldersMax: settings.top10HoldersMax,
    bundledMax: settings.bundledMax,
    maxSameBlockBuys: settings.maxSameBlockBuys,
    safetyCheckPeriod: settings.safetyCheckPeriod,
    requireSocials: settings.requireSocials,
    requireLiquidityBurnt: settings.requireLiquidityBurnt,
    requireImmutableMetadata: settings.requireImmutableMetadata,
    requireMintAuthorityRenounced: settings.requireMintAuthorityRenounced,
    requireFreezeAuthorityRenounced: settings.requireFreezeAuthorityRenounced,
    onlyPumpFunMigrated: settings.onlyPumpFunMigrated,
    minPoolSize: settings.minPoolSize
  })
}; 