# Best Sniper Sol - Deployment Guide

## 🚀 Complete Integrated Solution

This is a **single-port, integrated solution** where the backend serves the frontend from the same port (3000). No separate frontend/backend setup needed!

## 📁 Project Structure

```
best-sniper-sol/
├── server.js              # Main server (serves both API and frontend)
├── tradingEngine.js       # Trading logic (exactly as provided by client)
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
├── wallet/                # Place your Solana wallet here
│   └── id.json           # Your wallet keypair
├── public/                # Frontend files (served by backend)
│   ├── index.html        # Main dashboard
│   └── app.js            # Frontend JavaScript
├── README.md              # Documentation
└── DEPLOYMENT.md          # This file
```

## 🛠️ Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env` file:
```env
SOLANA_WALLET_PATH=./wallet/id.json
PORT=3000
```

### 3. Add Your Wallet
Place your Solana wallet JSON file at `./wallet/id.json`

### 4. Start the Application
```bash
npm start
```

### 5. Access Dashboard
Open your browser and go to: **http://localhost:3000**

## 🌐 Production Deployment (DigitalOcean VPS)

### 1. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Git
sudo apt install git -y
```

### 2. Deploy Application
```bash
# Clone or upload your project
cd /var/www
sudo mkdir best-sniper-sol
sudo chown $USER:$USER best-sniper-sol
cd best-sniper-sol

# Upload your project files here
# Then install dependencies
npm install
```

### 3. Configure Environment
```bash
# Create .env file
nano .env
```

Add your configuration:
```env
SOLANA_WALLET_PATH=./wallet/id.json
PORT=3000
```

### 4. Add Your Wallet
```bash
# Create wallet directory
mkdir wallet

# Upload your wallet JSON file to ./wallet/id.json
# Make sure it has proper permissions
chmod 600 wallet/id.json
```

### 5. Start with PM2
```bash
# Start the application
npm run deploy

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions provided
```

### 6. Configure Nginx (Optional - for domain)
```bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/bestsnipersol.com
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name bestsnipersol.com www.bestsnipersol.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/bestsnipersol.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. SSL Certificate (Optional)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d bestsnipersol.com -d www.bestsnipersol.com
```

## 🔧 Management Commands

### PM2 Commands
```bash
# Start application
npm run deploy

# Stop application
npm run stop

# Restart application
npm run restart

# View logs
pm2 logs best-sniper-sol

# Monitor processes
pm2 monit

# List all processes
pm2 list
```

### Application Commands
```bash
# Start in development mode (with auto-restart)
npm run dev

# Start in production mode
npm start
```

## 🔒 Security Notes

1. **Wallet Security**: Never commit your wallet file to version control
2. **Environment Variables**: Keep your `.env` file secure
3. **Firewall**: Configure your server firewall to only allow necessary ports
4. **SSL**: Always use HTTPS in production
5. **Backup**: Regularly backup your wallet and configuration

## 📊 Monitoring

### PM2 Monitoring
```bash
# View real-time monitoring
pm2 monit

# View logs
pm2 logs best-sniper-sol --lines 100

# View application status
pm2 show best-sniper-sol
```

### Application Monitoring
- Dashboard shows real-time bot status
- Live trading logs
- System performance metrics
- Wallet balance and trade history

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using port 3000
   sudo netstat -tulpn | grep :3000
   
   # Kill the process
   sudo kill -9 <PID>
   ```

2. **Wallet Not Loading**
   - Check file permissions: `chmod 600 wallet/id.json`
   - Verify JSON format is correct
   - Check file path in `.env`

3. **PM2 Issues**
   ```bash
   # Reset PM2
   pm2 delete all
   pm2 start server.js --name best-sniper-sol
   pm2 save
   ```

4. **Node.js Version Issues**
   ```bash
   # Check Node.js version
   node --version
   
   # Should be 18+ for best compatibility
   ```

## 📞 Support

For support and updates:
- Check the dashboard's built-in support chat
- Review logs in the dashboard
- Monitor system performance metrics

## 🎯 Features Included

✅ **Integrated Solution** - Single port, no separate frontend/backend  
✅ **Professional UI** - SniperSol-style design with black and royal blue theme  
✅ **Wallet Integration** - Secure wallet connection and management  
✅ **Real-time Dashboard** - Live trading table, system stats, bot controls  
✅ **Settings Management** - All bot parameters with sliders  
✅ **Auto-restart** - PM2 integration for 24/7 operation  
✅ **Support Chat** - Built-in support widget  
✅ **Production Ready** - SSL, Nginx, PM2 deployment scripts  

**Ready for production deployment! 🚀** 