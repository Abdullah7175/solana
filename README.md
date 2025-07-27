# Best Sniper Sol - Professional Solana Trading Bot

A complete replica of snipersol.app with a robust, feature-rich frontend for trading on Pump.fun and Dexscreener.

![Best Sniper Sol](https://img.shields.io/badge/Status-Ready-green)
![Node.js](https://img.shields.io/badge/Node.js-18+-blue)
![Solana](https://img.shields.io/badge/Solana-Mainnet-purple)

## 🚀 Features

### Frontend Features (Replicating snipersol.app)
- **5-Tab Navigation**: Home, Prices, FAQ, Source Code, Contact
- **Trading Parameters Setup**: Configure all bot settings before wallet connection
- **Pricing Table**: Multiple subscription plans with different transaction fees
- **Wallet Connection Flow**: Connect wallet anytime during the process
- **Trading Dashboard**: Real-time trading interface with system metrics
- **Responsive Design**: Works on desktop and mobile devices

### Trading Features
- **Pump.fun Integration**: Automatic token detection and trading
- **Dexscreener Integration**: Market data and price monitoring
- **Advanced Auto-Sell**: Configurable profit targets and stop-loss
- **Real-time Monitoring**: Live updates via WebSocket
- **System Metrics**: CPU, Memory, Network latency tracking

### User Experience
- **No Wallet Required Initially**: Set parameters first, connect wallet later
- **Trading Initialization**: Professional loading screen
- **Wallet Selection**: Support for Phantom, Solflare, Magic Eden, Trust Wallet, Ledger
- **Live Trading Table**: Real-time token tracking and status updates

## 📋 Prerequisites

- Node.js 18+ 
- Solana CLI (optional, for wallet management)
- A funded Solana wallet

## 🛠️ Installation

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd best-sniper-sol
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your settings
   ```

4. **Set up your wallet**
   - Place your Solana wallet JSON file in the `wallet/` directory
   - Ensure it's named `id.json` or update the path in `.env`

5. **Start the application**
   ```bash
   npm start
   ```

6. **Access the dashboard**
   - Open your browser to `http://localhost:3000`
   - The application will load with the Home tab active

## 🎯 Usage Guide

### Step 1: Configure Trading Parameters
1. Navigate to the **Home** or **Prices** tab
2. Set your trading parameters:
   - Transaction Executor (Jito recommended)
   - Purchase Amount Range (0.1-0.2 SOL)
   - Purchase Interval (0.1-0.5 seconds)
   - Buy Slippage (5%)
   - Take Profit (30%)
   - Stop Loss (10%)
   - Max Dev Allocation (30%)
   - Purchase Speed (Instant)
   - Enable Advanced Auto-Sell

### Step 2: Launch Trading Bot
1. Click the **"Launch Trading Bot"** button
2. Wait for the trading initialization screen
3. The dashboard will open automatically

### Step 3: Connect Wallet (Optional)
1. In the dashboard, click **"Connect Wallet"**
2. Choose your preferred wallet:
   - Phantom Wallet (Recommended)
   - Solflare
   - Magic Eden
   - Trust Wallet
   - Ledger
3. Approve the connection in your wallet extension

### Step 4: Monitor Trading
- View real-time trading data in the table
- Monitor system metrics (CPU, Memory, Network)
- Check wallet balance and transaction status
- Use the STOP button to halt trading

## 📊 Dashboard Features

### Home Tab
- Trading parameter configuration
- Welcome message and video
- Launch trading bot button

### Prices Tab
- Complete pricing table with different plans
- Same trading parameters as Home tab
- Payment instructions and guidelines

### FAQ Tab
- Frequently asked questions
- How it works section with step-by-step guide
- Trading strategy explanation

### Source Code Tab
- Technology stack information
- Source code access (if available)
- Development transparency

### Contact Tab
- Contact form for support
- User feedback submission

## 🔧 Configuration

### Environment Variables (.env)
```env
SOLANA_WALLET_PATH=./wallet/id.json
PORT=3000
MINIMUM_BUY_AMOUNT=0.015
MAX_BONDING_CURVE_PROGRESS=10
SELL_BONDING_CURVE_PROGRESS=15
```

### Trading Parameters
- **Transaction Executor**: Choose between Jito, Helius, QuickNode
- **Purchase Amount**: Set fixed or random range for buy amounts
- **Purchase Interval**: Time between purchase attempts
- **Slippage**: Maximum acceptable price deviation
- **Profit Targets**: Take profit at 25% and 50% gains
- **Stop Loss**: Automatic sell at 10% loss
- **Liquidity Filter**: Minimum liquidity requirement
- **Auto-Sell**: Advanced selling strategies

## 🚀 Deployment

### Local Development
```bash
npm run dev  # Auto-restart on file changes
```

### Production Deployment
```bash
# Using PM2 (recommended)
npm run deploy

# Manual deployment
npm start
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔒 Security Features

- **No Fund Storage**: We never store or access your funds
- **Encrypted Connections**: All communications are encrypted
- **Open Source**: Code is available for review
- **Wallet Control**: You maintain complete control of your wallet

## 📈 Trading Strategy

The bot implements a sophisticated trading strategy:

1. **Token Detection**: Scans Pump.fun for new token launches
2. **Bonding Curve Analysis**: Evaluates token potential
3. **Automatic Purchase**: Buys when conditions are favorable
4. **Real-time Monitoring**: Tracks market cap and price changes
5. **Profit Taking**: Sells 50% at 25% gain, remaining at 50% gain
6. **Stop Loss**: Sells all if price drops 10%
7. **Moon Bag**: Keeps 25% for potential higher gains

## 🆘 Support

- **Documentation**: Check the FAQ tab in the application
- **Issues**: Report problems through the Contact tab
- **Updates**: Follow the project for latest features

## 📄 License

MIT License - see LICENSE file for details

## ⚠️ Disclaimer

This software is for educational and trading purposes. Use at your own risk. Cryptocurrency trading involves substantial risk of loss. The developers are not responsible for any financial losses incurred through the use of this software.

---

**Best Sniper Sol** - Professional Solana Trading Bot with Web Dashboard 