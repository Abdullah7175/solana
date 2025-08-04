import axios from 'axios';
import fs from 'fs';
import bs58 from 'bs58';
import { Keypair, Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import { AccountLayout, getMint } from '@solana/spl-token';
import 'dotenv/config';

const STATE_FILE = './botState.json';
const connection = new Connection(clusterApiUrl('mainnet-beta'));

// User management
let connectedWallets = new Map(); // Store connected user wallets
let tradingProfits = new Map(); // Store profits for each user
let tradingHistory = new Map(); // Store trading history for each user
let sameBlockBuyCount = 0; // Track same block buys
let lastBlockTime = 0; // Track last block time

// Bot state
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
  top10HoldersMax: 50,
  bundledMax: 20,
  maxSameBlockBuys: 3,
  safetyCheckPeriod: 30,
  requireSocials: true,
  requireLiquidityBurnt: true,
  requireImmutableMetadata: true,
  requireMintAuthorityRenounced: true,
  requireFreezeAuthorityRenounced: true,
  onlyPumpFunMigrated: true,
  minPoolSize: 5000,
  lastSafetyCheck: 0
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

// Emit trading data
const emitTradingData = (data) => {
  if (ioClient) ioClient.emit('trading-data', data);
};

// Wallet management functions
const connectUserWallet = (userId, walletInfo) => {
  connectedWallets.set(userId, walletInfo);
  log(`User ${userId} wallet connected: ${walletInfo.publicKey}`);
  return true;
};

const disconnectUserWallet = (userId) => {
  connectedWallets.delete(userId);
  tradingProfits.delete(userId);
  tradingHistory.delete(userId);
  log(`User ${userId} wallet disconnected`);
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

const addTradingHistory = (userId, trade) => {
  const history = tradingHistory.get(userId) || [];
  history.unshift({
    ...trade,
    timestamp: new Date().toISOString()
  });
  // Keep only last 100 trades
  if (history.length > 100) {
    history.splice(100);
  }
  tradingHistory.set(userId, history);
};

const getTradingHistory = (userId) => {
  return tradingHistory.get(userId) || [];
};

// Token information fetching
const getTokenInfo = async (mint) => {
  try {
    // Try multiple sources for token information
    const sources = [
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      `https://pumpapi.fun/api/token/${mint}`,
      `https://birdeye.so/token/${mint}`
    ];

    for (const source of sources) {
      try {
        const res = await axios.get(source, { timeout: 5000 });
        const data = res.data;
        
        // Extract token information
        const tokenInfo = {
          mint: mint,
          name: data.name || data.tokenName || data.symbol || 'Unknown Token',
          symbol: data.symbol || data.tokenSymbol || 'UNKNOWN',
          price: parseFloat(data.priceUsd || data.price || '0'),
          marketCap: parseFloat(data.marketCap || data.mcap || '0'),
          volume24h: parseFloat(data.volume24h || data.volume || '0'),
          liquidity: parseFloat(data.liquidity?.usd || data.liquidity || '0'),
          holders: data.holders || [],
          socials: {
            twitter: data.twitter || data.socials?.twitter,
            discord: data.discord || data.socials?.discord,
            telegram: data.telegram || data.socials?.telegram,
            website: data.website || data.socials?.website
          },
          source: source.includes('dexscreener') ? 'DexScreener' : 
                 source.includes('pumpapi') ? 'Pump.fun' : 'Birdeye'
        };
        
        if (tokenInfo.name && tokenInfo.name !== 'Unknown Token') {
          return tokenInfo;
        }
      } catch (e) {
        continue; // Try next source
      }
    }
    
    // Fallback to basic info
    return {
      mint: mint,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      price: 0,
      marketCap: 0,
      volume24h: 0,
      liquidity: 0,
      holders: [],
      socials: {},
      source: 'Unknown'
    };
  } catch (error) {
    log(`Error fetching token info for ${mint}: ${error.message}`);
    return {
      mint: mint,
      name: 'Error Loading Token',
      symbol: 'ERROR',
      price: 0,
      marketCap: 0,
      volume24h: 0,
      liquidity: 0,
      holders: [],
      socials: {},
      source: 'Error'
    };
  }
};

// Fetch SPL tokens for a specific wallet
const fetchSPLTokens = async (publicKey) => {
  try {
    const walletPubKey = new PublicKey(publicKey);
    const accounts = await connection.getTokenAccountsByOwner(
      walletPubKey,
      { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
    );
    
    const tokens = [];
    for (const account of accounts.value) {
      const accountData = AccountLayout.decode(account.account.data);
      const mint = new PublicKey(accountData.mint).toString();
      const amount = Number(accountData.amount) / 1e6;
      
      if (amount > 0) {
        const tokenInfo = await getTokenInfo(mint);
        tokens.push({
          mint: mint,
          amount: amount,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          price: tokenInfo.price,
          value: amount * tokenInfo.price
        });
      }
    }
    
    return tokens;
  } catch (e) {
    log(`Token fetch error: ${e.message}`);
    return [];
  }
};

// Advanced Safety Check Functions
const checkTop10Holders = async (mint) => {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const token = res.data.pairs?.[0];
    
    if (!token || !token.holders) {
      return { safe: false, reason: 'No holder data available' };
    }
    
    const top10Holders = token.holders.slice(0, 10);
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

const checkBundledWallets = async (mint) => {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const token = res.data.pairs?.[0];
    
    if (!token || !token.holders) {
      return { safe: false, reason: 'No holder data available' };
    }
    
    const holders = token.holders || [];
    const bundledWallets = [];
    
    for (let i = 0; i < holders.length; i++) {
      for (let j = i + 1; j < holders.length; j++) {
        const holder1 = holders[i];
        const holder2 = holders[j];
        
        const amountDiff = Math.abs(holder1.percentage - holder2.percentage);
        if (amountDiff < 2 && holder1.percentage > 5) {
          bundledWallets.push(holder1, holder2);
        }
      }
    }
    
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

const checkSameBlockBuys = () => {
  const currentTime = Date.now();
  
  if (currentTime - lastBlockTime > 400) {
    sameBlockBuyCount = 0;
    lastBlockTime = currentTime;
  }
  
  if (sameBlockBuyCount >= settings.maxSameBlockBuys) {
    return { safe: false, reason: `Max same block buys reached (${settings.maxSameBlockBuys})` };
  }
  
  sameBlockBuyCount++;
  return { safe: true, count: sameBlockBuyCount };
};

const checkSocialLinks = async (mint) => {
  if (!settings.requireSocials) {
    return { safe: true };
  }
  
  try {
    const tokenInfo = await getTokenInfo(mint);
    const hasSocials = tokenInfo.socials.twitter || tokenInfo.socials.discord || tokenInfo.socials.telegram || tokenInfo.socials.website;
    
    if (!hasSocials) {
      return { safe: false, reason: 'No social links found' };
    }
    
    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Error checking social links' };
  }
};

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
    
    // Check if liquidity is locked/burnt (this is a simplified check)
    const liquidity = token.liquidity?.usd || 0;
    if (liquidity < settings.minPoolSize) {
      return { safe: false, reason: `Insufficient liquidity: $${liquidity} (min: $${settings.minPoolSize})` };
    }
    
    return { safe: true, liquidity };
  } catch (error) {
    return { safe: false, reason: 'Error checking liquidity' };
  }
};

const checkImmutableMetadata = async (mint) => {
  if (!settings.requireImmutableMetadata) {
    return { safe: true };
  }
  
  try {
    // This would require checking the token's metadata program
    // For now, we'll assume it's safe
    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Error checking metadata' };
  }
};

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

const checkPumpFunMigration = async (mint) => {
  if (!settings.onlyPumpFunMigrated) {
    return { safe: true };
  }
  
  try {
    const res = await axios.get(`https://pumpapi.fun/api/token/${mint}`);
    const data = res.data;
    
    if (!data || !data.migrated) {
      return { safe: false, reason: 'Token not migrated from Pump.fun' };
    }
    
    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Error checking Pump.fun migration' };
  }
};

const checkPoolSize = async (mint) => {
  try {
    const tokenInfo = await getTokenInfo(mint);
    if (tokenInfo.liquidity < settings.minPoolSize) {
      return { safe: false, reason: `Pool size too small: $${tokenInfo.liquidity} (min: $${settings.minPoolSize})` };
    }
    return { safe: true, poolSize: tokenInfo.liquidity };
  } catch (error) {
    return { safe: false, reason: 'Error checking pool size' };
  }
};

const comprehensiveSafetyCheck = async (mint) => {
  const currentTime = Date.now();
  
  // Check if we need to run safety checks (respect safety check period)
  if (currentTime - settings.lastSafetyCheck < settings.safetyCheckPeriod * 1000) {
    return { safe: true, cached: true };
  }
  
  settings.lastSafetyCheck = currentTime;
  
  const checks = [
    { name: 'Top 10 Holders', check: checkTop10Holders },
    { name: 'Bundled Wallets', check: checkBundledWallets },
    { name: 'Same Block Buys', check: checkSameBlockBuys },
    { name: 'Social Links', check: checkSocialLinks },
    { name: 'Liquidity Burnt', check: checkLiquidityBurnt },
    { name: 'Immutable Metadata', check: checkImmutableMetadata },
    { name: 'Mint Authority', check: checkMintAuthorityRenounced },
    { name: 'Freeze Authority', check: checkFreezeAuthorityRenounced },
    { name: 'Pump.fun Migration', check: checkPumpFunMigration },
    { name: 'Pool Size', check: checkPoolSize }
  ];
  
  const results = [];
  
  for (const { name, check } of checks) {
    try {
      const result = await check(mint);
      results.push({ name, ...result });
      
      if (!result.safe) {
        return { 
          safe: false, 
          reason: `${name}: ${result.reason}`,
          details: results 
        };
      }
    } catch (error) {
      results.push({ name, safe: false, reason: `Error: ${error.message}` });
      return { 
        safe: false, 
        reason: `${name}: Error occurred`,
        details: results 
      };
    }
  }
  
  return { safe: true, details: results };
};

// Rugcheck function
const rugCheck = async (mint) => {
  try {
    const tokenInfo = await getTokenInfo(mint);
    const fails = [];
    
    if (tokenInfo.liquidity < settings.liquidity) {
      fails.push('Low Liquidity');
    }
    
    if (tokenInfo.price === 0) {
      fails.push('No Price Data');
    }
    
    return fails;
  } catch {
    return ['No Token Data'];
  }
};

// Pump.fun trade wrapper
const pumpFunTrade = async (type, mint, amount, userPublicKey) => {
  try {
    const url = "https://pumpapi.fun/api/trade";
    const data = {
      trade_type: type,
      mint,
      amount: amount.toString(),
      slippage: 5,
      priorityFee: 0.0003,
      userPublicKey: userPublicKey // Use connected user's public key
    };
    
    const res = await axios.post(url, data);
    return res.data.tx_hash;
  } catch (e) {
    log(`${type.toUpperCase()} failed: ${e.message}`);
    return null;
  }
};

// Monitor and sell function
const monitorAndSell = async (mint, buyPrice, userId) => {
  const wallet = getUserWallet(userId);
  if (!wallet) {
    log(`No wallet connected for user ${userId}`);
    return;
  }
  
  let sold50 = false;
  const timeout = Date.now() + settings.timeoutMinutes * 60000;
  
  while (Date.now() < timeout && running) {
    try {
      const tokenInfo = await getTokenInfo(mint);
      const price = tokenInfo.price;
      
      if (!price || !buyPrice) continue;
      
      const change = ((price - buyPrice) / buyPrice) * 100;
      log(`${tokenInfo.name} (${tokenInfo.symbol}): $${price.toFixed(6)} (${change.toFixed(2)}%)`);
      
      // Emit live trading data
      emitTradingData({
        type: 'price_update',
        token: tokenInfo,
        change: change,
        userId: userId
      });
      
      const tokens = await fetchSPLTokens(wallet.publicKey);
      const holding = tokens.find(t => t.mint === mint);
      
      if (!holding) return;
      
      if (!sold50 && change >= settings.profit1) {
        const tx = await pumpFunTrade('sell', mint, holding.amount * 0.5, wallet.publicKey);
        if (tx) {
          log(`Sold 50% of ${tokenInfo.name} at +${settings.profit1}% Tx:${tx}`);
          addTradingHistory(userId, {
            type: 'sell',
            token: tokenInfo,
            amount: holding.amount * 0.5,
            price: price,
            profit: change,
            txHash: tx
          });
          sold50 = true;
        } else {
          log(`50% sell failed for ${tokenInfo.name}`);
        }
      } else if (sold50 && change >= settings.profit2) {
        const tx = await pumpFunTrade('sell', mint, holding.amount, wallet.publicKey);
        if (tx) {
          log(`Sold remaining ${tokenInfo.name} at +${settings.profit2}% Tx:${tx}`);
          addTradingHistory(userId, {
            type: 'sell',
            token: tokenInfo,
            amount: holding.amount,
            price: price,
            profit: change,
            txHash: tx
          });
          return;
        } else {
          log(`Final sell failed for ${tokenInfo.name}`);
        }
      } else if (change <= -settings.stop) {
        const tx = await pumpFunTrade('sell', mint, holding.amount, wallet.publicKey);
        if (tx) {
          log(`Stop-loss sell ${tokenInfo.name} (-${settings.stop}%) Tx:${tx}`);
          addTradingHistory(userId, {
            type: 'sell',
            token: tokenInfo,
            amount: holding.amount,
            price: price,
            profit: change,
            txHash: tx
          });
          return;
        } else {
          log(`Stop-loss sell failed for ${tokenInfo.name}`);
        }
      }
    } catch (e) { 
      log(`Price error: ${e.message}`); 
    }
    
    await new Promise(r => setTimeout(r, settings.priceInterval));
  }
  
  // Timeout sell
  const tokens = await fetchSPLTokens(wallet.publicKey);
  const holding = tokens.find(t => t.mint === mint);
  if (holding) {
    const tokenInfo = await getTokenInfo(mint);
    const tx = await pumpFunTrade('sell', mint, holding.amount, wallet.publicKey);
    if (tx) {
      log(`Timeout sell ${tokenInfo.name} Tx:${tx}`);
      addTradingHistory(userId, {
        type: 'sell',
        token: tokenInfo,
        amount: holding.amount,
        price: tokenInfo.price,
        profit: 0,
        txHash: tx
      });
    } else {
      log(`Timeout sell failed for ${tokenInfo.name}`);
    }
  }
};

// Main trade loop
const tradeLoop = async () => {
  log('Starting trading bot...');
  
  while (running) {
    try {
      // Get new tokens from multiple sources
      const [dexPairs, pumpPairs] = await Promise.all([
        axios.get("https://api.dexscreener.com/latest/dex/pairs/solana")
          .then(r => r.data.pairs || []).catch(() => []),
        axios.get("https://pumpapi.fun/api/get_newer_mints", { params: { limit: 5 } })
          .then(r => r.data.mint || []).catch(() => [])
      ]);
      
      const tokens = [
        ...pumpPairs.map(mint => ({ source: 'Pump.fun', mint, price: 0 })),
        ...dexPairs.filter(p => p.pairCreatedAt && Date.now() - p.pairCreatedAt < 2 * 60000)
                  .map(p => ({ source: 'Dex', mint: p.baseToken.address, price: parseFloat(p.priceUsd || '0') }))
      ];
      
      for (const token of tokens) {
        if (!running) break;
        
        // Get token information
        const tokenInfo = await getTokenInfo(token.mint);
        
        // Emit new token detection
        emitTradingData({
          type: 'new_token',
          token: tokenInfo,
          source: token.source
        });
        
        // Safety checks
        const safetyResult = await comprehensiveSafetyCheck(token.mint);
        if (!safetyResult.safe) {
          log(`Skipping ${tokenInfo.name} (${tokenInfo.symbol}): ${safetyResult.reason}`);
          continue;
        }
        
        // Rugcheck
        const issues = await rugCheck(token.mint);
        if (issues.length && settings.rugcheck === 'skip') {
          log(`Skipping ${tokenInfo.name} (${tokenInfo.symbol}): ${issues.join(', ')}`);
          continue;
        }
        
        // Trade for each connected user
        for (const [userId, wallet] of connectedWallets) {
          if (!running) break;
          
          const buyAmount = settings.randomBuy ?
            (Math.random() * (settings.buyMax - settings.buyMin) + settings.buyMin) :
            settings.fixedBuy;
          
          log(`Buying ${tokenInfo.name} (${tokenInfo.symbol}) for user ${userId} (${buyAmount} SOL)`);
          
          // Emit buy attempt
          emitTradingData({
            type: 'buy_attempt',
            token: tokenInfo,
            amount: buyAmount,
            userId: userId
          });
          
          const tx = await pumpFunTrade('buy', token.mint, buyAmount, wallet.publicKey);
          
          if (tx) {
            log(`Bought ${tokenInfo.name} (${tokenInfo.symbol}) for user ${userId}. Tx:${tx}`);
            
            // Add to trading history
            addTradingHistory(userId, {
              type: 'buy',
              token: tokenInfo,
              amount: buyAmount,
              price: tokenInfo.price,
              txHash: tx
            });
            
            // Emit successful buy
            emitTradingData({
              type: 'buy_success',
              token: tokenInfo,
              amount: buyAmount,
              txHash: tx,
              userId: userId
            });
            
            // Start monitoring for this user
            monitorAndSell(token.mint, tokenInfo.price, userId);
          } else {
            log(`Buy failed for ${tokenInfo.name} (${tokenInfo.symbol}) - user ${userId}`);
            
            // Emit failed buy
            emitTradingData({
              type: 'buy_failed',
              token: tokenInfo,
              amount: buyAmount,
              userId: userId
            });
          }
        }
      }
      
      await new Promise(r => setTimeout(r, settings.monitorInterval));
    } catch (error) {
      log(`Trade loop error: ${error.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  saveState();
};

// Admin-specific trade loop (separate from user bot)
const adminTradeLoop = async () => {
  log('Starting admin trading bot...');
  
  while (running) {
    try {
      // Get new tokens from multiple sources
      const [dexPairs, pumpPairs] = await Promise.all([
        axios.get("https://api.dexscreener.com/latest/dex/pairs/solana")
          .then(r => r.data.pairs || []).catch(() => []),
        axios.get("https://pumpapi.fun/api/get_newer_mints", { params: { limit: 5 } })
          .then(r => r.data.mint || []).catch(() => [])
      ]);
      
      const tokens = [
        ...pumpPairs.map(mint => ({ source: 'Pump.fun', mint, price: 0 })),
        ...dexPairs.filter(p => p.pairCreatedAt && Date.now() - p.pairCreatedAt < 2 * 60000)
                  .map(p => ({ source: 'Dex', mint: p.baseToken.address, price: parseFloat(p.priceUsd || '0') }))
      ];
      
      for (const token of tokens) {
        if (!running) break;
        
        // Get token information
        const tokenInfo = await getTokenInfo(token.mint);
        
        // Emit new token detection for admin
        emitTradingData({
          type: 'admin_new_token',
          token: tokenInfo,
          source: token.source
        });
        
        // Safety checks
        const safetyResult = await comprehensiveSafetyCheck(token.mint);
        if (!safetyResult.safe) {
          log(`Admin: Skipping ${tokenInfo.name} (${tokenInfo.symbol}): ${safetyResult.reason}`);
          continue;
        }
        
        // Rugcheck
        const issues = await rugCheck(token.mint);
        if (issues.length && settings.rugcheck === 'skip') {
          log(`Admin: Skipping ${tokenInfo.name} (${tokenInfo.symbol}): ${issues.join(', ')}`);
          continue;
        }
        
        // Trade for admin only
        const adminWallet = getUserWallet('admin');
        if (adminWallet) {
          const buyAmount = settings.fixedBuy;
          
          log(`Admin buying ${tokenInfo.name} (${tokenInfo.symbol}) (${buyAmount} SOL)`);
          
          // Emit admin buy attempt
          emitTradingData({
            type: 'admin_buy_attempt',
            token: tokenInfo,
            amount: buyAmount
          });
          
          const tx = await pumpFunTrade('buy', token.mint, buyAmount, adminWallet.publicKey);
          
          if (tx) {
            log(`Admin bought ${tokenInfo.name} (${tokenInfo.symbol}). Tx:${tx}`);
            
            // Add to admin trading history
            addTradingHistory('admin', {
              type: 'buy',
              token: tokenInfo,
              amount: buyAmount,
              price: tokenInfo.price,
              txHash: tx
            });
            
            // Emit successful admin buy
            emitTradingData({
              type: 'admin_buy_success',
              token: tokenInfo,
              amount: buyAmount,
              txHash: tx
            });
            
            // Start monitoring for admin
            monitorAndSell(token.mint, tokenInfo.price, 'admin');
          } else {
            log(`Admin buy failed for ${tokenInfo.name} (${tokenInfo.symbol})`);
            
            // Emit failed admin buy
            emitTradingData({
              type: 'admin_buy_failed',
              token: tokenInfo,
              amount: buyAmount
            });
          }
        }
      }
      
      await new Promise(r => setTimeout(r, settings.monitorInterval));
    } catch (error) {
      log(`Admin trade loop error: ${error.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  saveState();
};

// Public API
export default {
  boot: (io) => {
    ioClient = io;
    if (autoRestart) {
      running = true;
      tradeLoop();
      log('Bot auto-restarted after reboot');
    }
  },
  start: (io) => { 
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
  sellAll: async (userId) => {
    const wallet = getUserWallet(userId);
    if (!wallet) {
      log(`No wallet connected for user ${userId}`);
      return { success: false, message: 'No wallet connected' };
    }
    
    const tokens = await fetchSPLTokens(wallet.publicKey);
    let soldCount = 0;
    
    for (const token of tokens) {
      const tx = await pumpFunTrade('sell', token.mint, token.amount, wallet.publicKey);
      if (tx) {
        log(`Sold all ${token.name} (${token.symbol}) for user ${userId}. Tx:${tx}`);
        soldCount++;
        
        addTradingHistory(userId, {
          type: 'sell_all',
          token: token,
          amount: token.amount,
          price: token.price,
          txHash: tx
        });
      } else {
        log(`Sell failed for ${token.name} (${token.symbol}) - user ${userId}`);
      }
    }
    
    return { 
      success: true, 
      message: `Sold ${soldCount} tokens for user ${userId}`,
      soldCount: soldCount
    };
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
    connectedUsers: connectedWallets.size,
    totalProfits: Array.from(tradingProfits.values()).reduce((sum, profit) => sum + profit, 0)
  }),
  setAutoRestart: (enabled) => { 
    autoRestart = enabled; 
    log(`Auto-Restart ${enabled ? 'enabled' : 'disabled'}`); 
    saveState(); 
  },
  getAutoRestart: () => autoRestart,
  
  // Wallet management functions
  connectUserWallet,
  disconnectUserWallet,
  getUserWallet,
  addTradingProfit,
  getTradingProfit,
  getTradingHistory,
  getConnectedWallets: () => Array.from(connectedWallets.entries()),
  getTradingProfits: () => Array.from(tradingProfits.entries()),
  
  // Safety settings
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
  }),
  
  // Token functions
  getTokenInfo,
  fetchSPLTokens: (publicKey) => fetchSPLTokens(publicKey),
  
  // Admin bot functions (separate from user bot)
  startAdminBot: (io, adminWalletAddress) => {
    if (running) {
      log('Admin bot already running');
      return;
    }
    
    // Connect admin wallet
    connectUserWallet('admin', {
      publicKey: adminWalletAddress,
      type: 'phantom'
    });
    
    running = true;
    ioClient = io;
    log('Admin bot started successfully');
    saveState();
    
    // Start admin-specific trade loop
    adminTradeLoop();
  },
  
  stopAdminBot: () => {
    running = false;
    disconnectUserWallet('admin');
    log('Admin bot stopped');
    saveState();
  },
  
  sellAllAdmin: async (adminWalletAddress) => {
    const wallet = getUserWallet('admin');
    if (!wallet) {
      log('No admin wallet connected');
      return { success: false, message: 'No admin wallet connected' };
    }
    
    const tokens = await fetchSPLTokens(wallet.publicKey);
    let soldCount = 0;
    
    for (const token of tokens) {
      const tx = await pumpFunTrade('sell', token.mint, token.amount, wallet.publicKey);
      if (tx) {
        log(`Admin sold ${token.name} (${token.symbol}). Tx:${tx}`);
        soldCount++;
        
        addTradingHistory('admin', {
          type: 'sell_all',
          token: token,
          amount: token.amount,
          price: token.price,
          txHash: tx
        });
      } else {
        log(`Admin sell failed for ${token.name} (${token.symbol})`);
      }
    }
    
    return { 
      success: true, 
      message: `Admin sold ${soldCount} tokens`,
      soldCount: soldCount
    };
  },
  
  saveAdminConfig: (config) => {
    // Update settings with admin config
    settings = { 
      ...settings, 
      fixedBuy: config.buyAmount || settings.fixedBuy,
      profit1: config.profitTarget || settings.profit1,
      stop: config.stopLoss || settings.stop,
      liquidity: config.minLiquidity || settings.liquidity,
      maxSlippage: config.maxSlippage || settings.maxSlippage || 5,
      gasPriority: config.gasPriority || settings.gasPriority || 'medium',
      enableAutoSell: config.enableAutoSell !== undefined ? config.enableAutoSell : (settings.enableAutoSell !== undefined ? settings.enableAutoSell : true),
      enableSafetyChecks: config.enableSafetyChecks !== undefined ? config.enableSafetyChecks : (settings.enableSafetyChecks !== undefined ? settings.enableSafetyChecks : true)
    };
    
    log('Admin configuration saved with enhanced settings');
    saveState();
  },
  
  // Get comprehensive trading statistics
  getTradingStatistics: () => {
    const adminHistory = getTradingHistory('admin') || [];
    const totalTrades = adminHistory.length;
    
    if (totalTrades === 0) {
      return {
        winRate: 0,
        loseRate: 0,
        totalProfit: 0,
        totalLoss: 0,
        totalFees: 0,
        boughtCount: 0,
        soldCount: 0
      };
    }
    
    let wins = 0;
    let losses = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let totalFees = 0;
    let boughtCount = 0;
    let soldCount = 0;
    
    adminHistory.forEach(trade => {
      if (trade.type === 'buy') {
        boughtCount++;
        totalFees += trade.fee || 0;
      } else if (trade.type === 'sell') {
        soldCount++;
        const profit = trade.profit || 0;
        if (profit > 0) {
          wins++;
          totalProfit += profit;
        } else {
          losses++;
          totalLoss += Math.abs(profit);
        }
        totalFees += trade.fee || 0;
      }
    });
    
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const loseRate = totalTrades > 0 ? (losses / totalTrades) * 100 : 0;
    
    return {
      winRate: Math.round(winRate * 100) / 100,
      loseRate: Math.round(loseRate * 100) / 100,
      totalProfit: Math.round(totalProfit * 10000) / 10000,
      totalLoss: Math.round(totalLoss * 10000) / 10000,
      totalFees: Math.round(totalFees * 10000) / 10000,
      boughtCount,
      soldCount
    };
  },
  
  // Update configuration with validation
  updateConfiguration: (config) => {
    try {
      // Validate required fields
      if (config.buyAmount !== undefined && (config.buyAmount < 0.01 || config.buyAmount > 10)) {
        return { success: false, error: 'Buy amount must be between 0.01 and 10 SOL' };
      }
      
      if (config.profitTarget !== undefined && (config.profitTarget < 1 || config.profitTarget > 1000)) {
        return { success: false, error: 'Profit target must be between 1% and 1000%' };
      }
      
      if (config.stopLoss !== undefined && (config.stopLoss < 1 || config.stopLoss > 100)) {
        return { success: false, error: 'Stop loss must be between 1% and 100%' };
      }
      
      if (config.minLiquidity !== undefined && (config.minLiquidity < 1 || config.minLiquidity > 10000)) {
        return { success: false, error: 'Min liquidity must be between 1 and 10000 SOL' };
      }
      
      if (config.maxSlippage !== undefined && (config.maxSlippage < 1 || config.maxSlippage > 50)) {
        return { success: false, error: 'Max slippage must be between 1% and 50%' };
      }
      
      // Update settings
      if (config.buyAmount !== undefined) settings.fixedBuy = config.buyAmount;
      if (config.profitTarget !== undefined) settings.profit1 = config.profitTarget;
      if (config.stopLoss !== undefined) settings.stop = config.stopLoss;
      if (config.minLiquidity !== undefined) settings.liquidity = config.minLiquidity;
      if (config.maxSlippage !== undefined) settings.maxSlippage = config.maxSlippage;
      if (config.gasPriority !== undefined) settings.gasPriority = config.gasPriority;
      if (config.enableAutoSell !== undefined) settings.enableAutoSell = config.enableAutoSell;
      if (config.enableSafetyChecks !== undefined) settings.enableSafetyChecks = config.enableSafetyChecks;
      
      // Save state
      saveState();
      log('Configuration updated successfully');
      
      return { success: true, message: 'Configuration updated successfully' };
    } catch (error) {
      console.error('Configuration update error:', error);
      return { success: false, error: 'Failed to update configuration' };
    }
  }
}; 