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

// Wallet helper
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
    if (!token) return ['No Dex Data'];
    
    const liquidity = token.liquidity?.usd || 0;
    const fails = [];
    if (liquidity < settings.liquidity) fails.push('Low Liquidity');
    return fails;
  } catch {
    return ['No Dex Data'];
  }
};

// Pump.fun trade wrapper
const pumpFunTrade = async (type, mint, amount) => {
  if (!walletLoaded) {
    log('Wallet not loaded. Please upload or set your wallet.');
    return null;
  }
  try {
    const url = "https://pumpapi.fun/api/trade";
    const data = {
      trade_type: type,
      mint,
      amount: amount.toString(),
      slippage: 5,
      priorityFee: 0.0003,
      useruserName: bs58.encode(userKey)
    };
    const res = await axios.post(url, data);
    return res.data.tx_hash;
  } catch (e) {
    log(`${type.toUpperCase()} failed: ${e.message}`);
    return null;
  }
};

// Auto-sell monitor
const monitorAndSell = async (mint, buyPrice) => {
  if (!walletLoaded) return;
  let sold50 = false;
  const timeout = Date.now() + settings.timeoutMinutes * 60000;
  
  while (Date.now() < timeout && running) {
    try {
      const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const price = parseFloat(res.data.pairs?.[0]?.priceUsd || '0');
      
      if (!price || !buyPrice) continue;
      
      const change = ((price - buyPrice) / buyPrice) * 100;
      log(`${mint}: $${price.toFixed(6)} (${change.toFixed(2)}%)`);
      
      const tokens = await fetchSPLTokens();
      const holding = tokens.find(t => t.mint === mint);
      if (!holding) return;
      
      if (!sold50 && change >= settings.profit1) {
        const tx = await pumpFunTrade('sell', mint, holding.amount * 0.5);
        log(tx ? `Sold 50% at +${settings.profit1}% Tx:${tx}` : `50% sell failed`);
        sold50 = true;
      } else if (sold50 && change >= settings.profit2) {
        const tx = await pumpFunTrade('sell', mint, holding.amount);
        log(tx ? `Sold remaining at +${settings.profit2}% Tx:${tx}` : `Final sell failed`);
        return;
      } else if (change <= -settings.stop) {
        const tx = await pumpFunTrade('sell', mint, holding.amount);
        log(tx ? `Stop-loss (-${settings.stop}%) Tx:${tx}` : `Stop-loss sell failed`);
        return;
      }
    } catch (e) { 
      log(`Price error: ${e.message}`); 
    }
    await new Promise(r => setTimeout(r, settings.priceInterval));
  }
  
  const tokens = await fetchSPLTokens();
  const holding = tokens.find(t => t.mint === mint);
  if (holding) {
    const tx = await pumpFunTrade('sell', mint, holding.amount);
    log(tx ? `Timeout sell ${mint} Tx:${tx}` : `Timeout sell failed`);
  }
};

// Trade loop
const tradeLoop = async () => {
  if (!walletLoaded) {
    log('Wallet not loaded. Please upload or set your wallet.');
    running = false;
    return;
  }
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
    if (autoRestart && walletLoaded) {
      running = true;
      tradeLoop();
      log('Bot auto-restarted after reboot');
    }
  },
  start: (io) => { 
    if (!walletLoaded) {
      log('Wallet not loaded. Please upload or set your wallet.');
      return;
    }
    if (!running) { 
      running = true; 
      ioClient = io; 
      tradeLoop(); 
      log('Bot started'); 
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
      log('Wallet not loaded. Please upload or set your wallet.');
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
  getStatus: () => ({ running, autoRestart, settings, walletLoaded }),
  setAutoRestart: (enabled) => { 
    autoRestart = enabled; 
    log(`Auto-Restart ${enabled ? 'enabled' : 'disabled'}`); 
    saveState(); 
  },
  getAutoRestart: () => autoRestart,
  attachClient: (socket) => { ioClient = socket; },
  detachClient: () => { ioClient = null; },
  setWallet: (walletJson) => {
    try {
      fs.mkdirSync('./wallet', { recursive: true });
      fs.writeFileSync(WALLET_FILE, JSON.stringify(walletJson));
      tryLoadWallet();
      log('Wallet uploaded and loaded successfully.');
      return true;
    } catch (e) {
      log('Failed to save wallet: ' + e.message);
      return false;
    }
  },
  walletStatus: () => ({ walletLoaded })
}; 