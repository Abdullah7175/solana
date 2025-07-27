# SniperBot Trading Bot (Pump.fun + Dexscreener)

This project is a **Node.js + React** based Solana trading bot with a SniperSol-style dashboard.

## Features
- Trades automatically on **Pump.fun and Dexscreener** (Solana).
- **SniperSol-style web dashboard** (React + Tailwind).
- Manual **Start / Stop / Sell All** controls.
- **Auto-Restart toggle** (off by default, resumes bot after server reboot if enabled).
- **Live logs via WebSocket** (real-time trade and status updates).
- Adjustable settings via sliders:
  - Fixed or Random Buy Amounts
  - Profit Targets (TP1 / TP2)
  - Stop-Loss
  - Minimum Liquidity Filter
  - Rugcheck mode (skip low-liquidity pairs)

## Project Structure
```
project-root/
├── server.js            # Express backend + serves frontend + bot control APIs
├── tradingEngine.js     # Trading logic for Pump.fun + Dexscreener
├── package.json         # Dependencies and scripts
├── .env                 # Environment configuration (wallet path, port)
├── wallet/              # Place your Solana wallet JSON here (id.json)
└── public/              # Frontend dashboard (React-lite)
    ├── index.html
    └── app.js
```

## Setup Instructions

1. **Unzip the project** and enter the folder:
   ```bash
   cd sniperbot_full_project
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure your Solana wallet**:
   - Place your funded wallet JSON key at `./wallet/id.json`.
   - Make sure the wallet has SOL for gas and trades.
   - Edit `.env` if needed (default is `./wallet/id.json` and port `3000`).

4. **Run the bot locally**:
   ```bash
   npm start
   ```
   - Open your browser at: **http://localhost:3000**
   - Use the dashboard to start/stop the bot, sell tokens, and adjust settings.

5. **Deploy to DigitalOcean VPS** (or any server):
   ```bash
   # Install Node.js and Git
   curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
   apt-get install -y nodejs git
   
   # Upload or clone the project
   git clone <your-repo-or-upload>
   cd sniperbot_full_project
   npm install

   # Start manually
   node server.js
   ```

6. **Run 24/7 with PM2**:
   ```bash
   npm install -g pm2
   pm2 start server.js --name sniperbot
   pm2 save
   pm2 startup
   ```
   - This will ensure the bot + dashboard restart on any server reboot.

7. **Enable Auto-Restart (Optional)**:
   - In the dashboard, toggle **Auto-Restart ON** if you want the bot to resume trading after reboot/crash automatically.
   - Leave OFF for manual control (default).

## Deliverables for Deployment
The developer should deliver:
- A live URL (IP or domain) for accessing the dashboard.
- Confirmation the bot trades as expected (manual controls + auto modes).
- PM2 configured for auto-start.
- A short guide for you on:
  - Updating the bot
  - Restarting/stopping the app
  - Managing Auto-Restart mode
