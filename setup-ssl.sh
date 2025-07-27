#!/bin/bash

# SSL Setup Script for SOUL|SPARK Trading Bot
# Run this script on your DigitalOcean droplet

echo "🔒 Setting up SSL certificate with Let's Encrypt..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "📦 Installing Certbot and Nginx..."
sudo apt install certbot python3-certbot-nginx nginx -y

# Create Nginx configuration
echo "⚙️ Creating Nginx configuration..."
sudo tee /etc/nginx/sites-available/sniper-bot > /dev/null <<EOF
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # WebSocket support
        proxy_set_header Sec-WebSocket-Extensions \$http_sec_websocket_extensions;
        proxy_set_header Sec-WebSocket-Key \$http_sec_websocket_key;
        proxy_set_header Sec-WebSocket-Version \$http_sec_websocket_version;
    }
}
EOF

# Enable the site
echo "🔗 Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/sniper-bot /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
echo "🧪 Testing Nginx configuration..."
sudo nginx -t
if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    sudo systemctl restart nginx
    sudo systemctl enable nginx
else
    echo "❌ Nginx configuration failed"
    exit 1
fi

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw --force enable

# Get SSL certificate
echo "🔐 Getting SSL certificate..."
echo "Enter your domain name (or press Enter to use IP address):"
read domain_name

if [ -n "$domain_name" ]; then
    echo "📧 Enter your email address for Let's Encrypt notifications:"
    read email_address
    
    echo "🔒 Getting SSL certificate for $domain_name..."
    sudo certbot --nginx -d $domain_name -d www.$domain_name --email $email_address --agree-tos --non-interactive
else
    echo "🔒 Getting SSL certificate for IP address..."
    echo "📧 Enter your email address for Let's Encrypt notifications:"
    read email_address
    
    # Get the server's IP address
    ip_address=$(curl -s ifconfig.me)
    sudo certbot --nginx --agree-tos --email $email_address --domains $ip_address --non-interactive
fi

# Set up auto-renewal
echo "🔄 Setting up automatic certificate renewal..."
(crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -

# Test renewal
echo "🧪 Testing certificate renewal..."
sudo certbot renew --dry-run

echo "✅ SSL setup complete!"
echo "🌐 Your app should now be accessible via HTTPS"
echo "📋 Certificate will auto-renew every 60 days" 