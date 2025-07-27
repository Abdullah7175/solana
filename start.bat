@echo off
title Best Sniper Sol - Trading Bot
color 0b

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    Best Sniper Sol                           ║
echo ║              Advanced Solana Trading Bot                     ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

echo 🚀 Starting Best Sniper Sol Trading Bot...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM Check if .env file exists
if not exist ".env" (
    echo ⚠️  .env file not found!
    echo Creating from template...
    copy env.example .env >nul
)

REM Check if wallet exists
if not exist "wallet\id.json" (
    echo ⚠️  Wallet not found!
    echo Please create wallet\id.json before starting the bot
    echo.
    pause
    exit /b 1
)

echo ✅ All checks passed!
echo.
echo 🌐 Dashboard will be available at: http://localhost:3000
echo 📝 Press Ctrl+C to stop the bot
echo.

REM Start the bot
npm start

echo.
echo Bot stopped.
pause 