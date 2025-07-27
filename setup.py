#!/usr/bin/env python3
"""
soul spark - Setup Script
Helps users quickly configure the trading bot
"""

import os
import json
import subprocess
import sys
from pathlib import Path

def print_banner():
    print("""
╔══════════════════════════════════════════════════════════════╗
║                    soul spark Setup                          ║
║              Advanced Solana Trading Bot                     ║
╚══════════════════════════════════════════════════════════════╝
    """)

def check_node_installed():
    """Check if Node.js is installed"""
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Node.js found: {result.stdout.strip()}")
            return True
        else:
            print("❌ Node.js not found")
            return False
    except FileNotFoundError:
        print("❌ Node.js not found. Please install Node.js first.")
        return False

def install_dependencies():
    """Install npm dependencies"""
    print("\n📦 Installing dependencies...")
    try:
        result = subprocess.run(['npm', 'install'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ Dependencies installed successfully")
            return True
        else:
            print(f"❌ Failed to install dependencies: {result.stderr}")
            return False
    except FileNotFoundError:
        print("❌ npm not found. Please install Node.js first.")
        return False

def create_env_file():
    """Create .env file from template"""
    if os.path.exists('.env'):
        print("✅ .env file already exists")
        return True
    
    if os.path.exists('env.example'):
        try:
            with open('env.example', 'r') as f:
                content = f.read()
            
            with open('.env', 'w') as f:
                f.write(content)
            
            print("✅ .env file created from template")
            return True
        except Exception as e:
            print(f"❌ Failed to create .env file: {e}")
            return False
    else:
        print("❌ env.example not found")
        return False

def setup_wallet():
    """Help user set up their Solana wallet"""
    wallet_dir = Path('wallet')
    wallet_file = wallet_dir / 'id.json'
    
    if wallet_file.exists():
        print("✅ Wallet file already exists")
        return True
    
    print("\n💰 Wallet Setup")
    print("You need to create a Solana wallet for trading.")
    
    choice = input("Do you want to create a new wallet? (y/n): ").lower()
    
    if choice == 'y':
        # Create wallet directory
        wallet_dir.mkdir(exist_ok=True)
        
        # Check if Solana CLI is available
        try:
            result = subprocess.run(['solana-keygen', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                print("✅ Solana CLI found")
                
                # Generate new keypair
                print("Generating new wallet...")
                result = subprocess.run([
                    'solana-keygen', 'new', '--outfile', str(wallet_file)
                ], capture_output=True, text=True)
                
                if result.returncode == 0:
                    print("✅ New wallet created successfully")
                    print(f"📁 Wallet saved to: {wallet_file}")
                    print("⚠️  IMPORTANT: Fund this wallet with SOL before trading!")
                    return True
                else:
                    print(f"❌ Failed to create wallet: {result.stderr}")
                    return False
            else:
                print("❌ Solana CLI not found")
                return False
        except FileNotFoundError:
            print("❌ Solana CLI not found. Please install Solana CLI first.")
            print("   Visit: https://docs.solana.com/cli/install-solana-cli-tools")
            return False
    else:
        print("⚠️  Please manually create wallet/id.json before starting the bot")
        return False

def show_next_steps():
    """Show next steps to the user"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║                        Next Steps                            ║
╚══════════════════════════════════════════════════════════════╝

1. 📝 Edit .env file if needed:
   - SOLANA_WALLET_PATH=./wallet/id.json
   - PORT=3000

2. 💰 Fund your wallet with SOL:
   - Send SOL to your wallet address
   - Include extra SOL for gas fees

3. 🚀 Start the bot:
   npm start

4. 🌐 Open dashboard:
   http://localhost:3000

5. ⚙️ Configure settings in the dashboard:
   - Set buy amounts
   - Configure profit targets
   - Adjust risk management

6. 🎯 Start trading:
   - Click "Start Bot" in dashboard
   - Monitor logs for activity

⚠️  IMPORTANT SECURITY NOTES:
- Never share your wallet/id.json file
- Use a dedicated trading wallet
- Start with small amounts to test
- Monitor the bot regularly

For help: Check README.md or the dashboard logs
    """)

def main():
    print_banner()
    
    # Check prerequisites
    if not check_node_installed():
        print("\n❌ Please install Node.js first:")
        print("   Visit: https://nodejs.org/")
        return False
    
    # Install dependencies
    if not install_dependencies():
        return False
    
    # Create environment file
    if not create_env_file():
        return False
    
    # Setup wallet
    if not setup_wallet():
        print("⚠️  Wallet setup incomplete. Please create wallet manually.")
    
    # Show next steps
    show_next_steps()
    
    print("\n🎉 Setup completed! You're ready to start trading.")
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n❌ Setup cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Setup failed: {e}")
        sys.exit(1) 