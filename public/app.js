(() => {
    const socket = io();
    let walletConnected = false;
    let currentWallet = null;
    let userToken = null;
    let botRunning = false;
    let logs = [];
    let settings = {
        buyMode: 'fixed',
        fixedBuyAmount: 0.1,
        minBuyAmount: 0.1,
        maxBuyAmount: 0.2,
        profitTarget1: 25,
        profitTarget2: 50,
        stopLoss: 10,
        minLiquidity: 1000,
        top10HoldersMax: 50,
        bundledMax: 20,
        maxSameBlock: 3,
        safetyCheckPeriod: 30,
        minPoolSize: 5000,
        requireSocials: false,
        requireLiquidityBurnt: false,
        requireImmutableMetadata: false,
        requireMintAuthorityRenounced: false,
        requireFreezeAuthorityRenounced: false,
        onlyPumpFunMigrated: false
    };

    // DOM Elements
    const elements = {
        navTabs: document.querySelectorAll('.nav-tab'),
        tabContents: document.querySelectorAll('.tab-content'),
        launchButtons: document.querySelectorAll('.launch-btn'),
        stopBot: document.getElementById('stop-bot-btn'),
        showAddress: document.getElementById('show-address-btn'),
        loginIcon: document.getElementById('loginIcon'),
        headerLogoutBtn: document.getElementById('headerLogoutBtn'),
        tradingDashboard: document.getElementById('trading-dashboard'),
        userStatus: document.getElementById('userStatus'),
        userInfo: document.getElementById('userInfo'),
        botStatus: document.getElementById('bot-status'),
        totalProfit: document.getElementById('total-profit'),
        tradesToday: document.getElementById('trades-today'),
        successRate: document.getElementById('success-rate'),
        logContainer: document.getElementById('log-container'),
        loadingOverlay: document.getElementById('loading-overlay'),
        notificationContainer: document.getElementById('notification-container')
    };

    // Initialize
    function init() {
        console.log('Initializing Best Sniper Sol...');
        setupEventListeners();
        setupSocketListeners();
        checkLoginStatus();
        updateSystemMetrics();
        startTradingSimulation();
        setupConfigPanel();
        setupDashboardCloseLogic();
        
        // Check for existing wallet connection
        checkPhantomWallet();
        
        console.log('Initialization complete');
    }

    // Check if Phantom wallet is already connected
    function checkPhantomWallet() {
        if (window.solana && window.solana.isPhantom && window.solana.isConnected) {
            console.log('Phantom wallet already connected');
            const walletAddress = window.solana.publicKey.toString();
            updateWalletUI(walletAddress, 'phantom');
        }
    }

    // Setup all event listeners
    function setupEventListeners() {
        // Tab navigation
        elements.navTabs.forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // Launch bot buttons
        elements.launchButtons.forEach(btn => {
            btn.addEventListener('click', launchTradingBot);
            // Initially disable until login
            btn.disabled = true;
            btn.classList.add('opacity-50');
        });
        
        // Login button
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', loginWithLicense);
        }
        
        // Enhanced Wallet Connection - Multiple Wallet Support
        setupWalletConnections();
        
        // Login icon in header
        if (elements.loginIcon) {
            console.log('Login icon found, adding event listener');
            elements.loginIcon.addEventListener('click', showLoginModal);
        } else {
            console.error('Login icon not found in DOM');
            // Try to find it again after a short delay
            setTimeout(() => {
                const loginIcon = document.getElementById('loginIcon');
                if (loginIcon) {
                    console.log('Login icon found on retry, adding event listener');
                    loginIcon.addEventListener('click', showLoginModal);
                } else {
                    console.error('Login icon still not found after retry');
                }
            }, 1000);
        }
        
        // Header logout button
        if (elements.headerLogoutBtn) {
            elements.headerLogoutBtn.addEventListener('click', handleLogout);
        }
        
        // Check login status on page load
        checkLoginStatus();

        // Dashboard controls
        if (elements.stopBot) {
            elements.stopBot.addEventListener('click', stopTradingBot);
        }
        if (elements.showAddress) {
            elements.showAddress.addEventListener('click', toggleAddressVisibility);
        }

        // Modal backdrop clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                hideAllModals();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideAllModals();
            }
        });
    }

    // Setup wallet connections for multiple wallet types
    function setupWalletConnections() {
        // Phantom Wallet
        const connectPhantomBtn = document.getElementById('connect-phantom');
        if (connectPhantomBtn) {
            connectPhantomBtn.addEventListener('click', () => connectWallet('phantom'));
        }

        // Solflare Wallet
        const connectSolflareBtn = document.getElementById('connect-solflare');
        if (connectSolflareBtn) {
            connectSolflareBtn.addEventListener('click', () => connectWallet('solflare'));
        }

        // Backpack Wallet
        const connectBackpackBtn = document.getElementById('connect-backpack');
        if (connectBackpackBtn) {
            connectBackpackBtn.addEventListener('click', () => connectWallet('backpack'));
        }

        // Ledger Wallet
        const connectLedgerBtn = document.getElementById('connect-ledger');
        if (connectLedgerBtn) {
            connectLedgerBtn.addEventListener('click', () => connectWallet('ledger'));
        }

        // Disconnect button
        const disconnectWalletBtn = document.getElementById('disconnect-wallet-btn');
        if (disconnectWalletBtn) {
            disconnectWalletBtn.addEventListener('click', disconnectWallet);
        }
    }

    // Enhanced wallet connection function - Using client's method
    async function connectWallet(walletType) {
        try {
            console.log(`Attempting to connect ${walletType} wallet...`);
            
            if (walletType === 'phantom') {
                if ('solana' in window) {
                    const provider = window.solana;

                    if (provider.isPhantom) {
                        try {
                            const resp = await provider.connect(); // Triggers Phantom extension popup
                            const publicKey = resp.publicKey.toString();
                            console.log('Connected wallet:', publicKey);
                            
                            // Check wallet balance before proceeding
                            const balance = await checkWalletBalance(publicKey);
                            console.log('Wallet balance:', balance, 'SOL');
                            
                            if (balance < 0.01) {
                                await provider.disconnect();
                                throw new Error('Insufficient wallet balance. Minimum 0.01 SOL required to connect wallet.');
                            }
                            
                            // Send wallet info to backend with balance
                            const response = await fetch('/api/connect-wallet', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    walletType: walletType,
                                    publicKey: publicKey,
                                    balance: balance
                                })
                            });

                            const result = await response.json();

                            if (result.success) {
                                walletConnected = true;
                                currentWallet = {
                                    type: walletType,
                                    address: publicKey,
                                    provider: provider,
                                    balance: balance
                                };

                                updateWalletUI(publicKey, walletType, balance);
                                
                                // Enable launch button if also logged in
                                const userToken = localStorage.getItem('userToken');
                                if (userToken) {
                                    elements.launchButtons.forEach(btn => {
                                        btn.disabled = false;
                                        btn.classList.remove('opacity-50');
                                    });
                                }

                                showNotification(`Phantom wallet connected successfully! Balance: ${balance.toFixed(4)} SOL`, 'success');
                                console.log('Wallet connected to backend:', result);
                            } else {
                                await provider.disconnect();
                                throw new Error(result.error || 'Failed to connect wallet to backend');
                            }

                        } catch (err) {
                            console.error('User rejected the connection or Phantom is locked', err);
                            throw new Error(err.message || 'User rejected the connection or Phantom is locked');
                        }
                    } else {
                        throw new Error('Phantom Wallet not detected. Please install it.');
                    }
                } else {
                    // If Phantom extension is not available, show in-app wallet import
                    showPhantomImportModal();
                    return;
                }
            } else {
                // For other wallet types, keep existing logic
                let walletProvider = null;
                let walletAddress = null;

                switch (walletType) {
                    case 'solflare':
                        if (window.solflare) {
                            const resp = await window.solflare.connect();
                            walletAddress = resp.publicKey.toString();
                            walletProvider = window.solflare;
                        } else {
                            throw new Error('Solflare wallet not installed. Please install Solflare wallet extension.');
                        }
                        break;

                    case 'backpack':
                        if (window.backpack) {
                            const resp = await window.backpack.connect();
                            walletAddress = resp.publicKey.toString();
                            walletProvider = window.backpack;
                        } else {
                            throw new Error('Backpack wallet not installed. Please install Backpack wallet extension.');
                        }
                        break;

                    case 'ledger':
                        showNotification('Ledger wallet connection requires additional setup. Please use Phantom or Solflare for now.', 'warning');
                        return;

                    default:
                        throw new Error(`Unsupported wallet type: ${walletType}`);
                }

                if (walletAddress && walletProvider) {
                    // Check wallet balance before proceeding
                    const balance = await checkWalletBalance(walletAddress);
                    
                    if (balance < 0.01) {
                        await walletProvider.disconnect();
                        throw new Error('Insufficient wallet balance. Minimum 0.01 SOL required to connect wallet.');
                    }
                    
                    // Send wallet info to backend
                    const response = await fetch('/api/connect-wallet', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            walletType: walletType,
                            publicKey: walletAddress,
                            balance: balance
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        walletConnected = true;
                        currentWallet = {
                            type: walletType,
                            address: walletAddress,
                            provider: walletProvider,
                            balance: balance
                        };

                        updateWalletUI(walletAddress, walletType, balance);
                        
                        // Enable launch button if also logged in
                        const userToken = localStorage.getItem('userToken');
                        if (userToken) {
                            elements.launchButtons.forEach(btn => {
                                btn.disabled = false;
                                btn.classList.remove('opacity-50');
                            });
                        }

                        showNotification(`${walletType} wallet connected successfully! Balance: ${balance.toFixed(4)} SOL`, 'success');
                    } else {
                        await walletProvider.disconnect();
                        throw new Error(result.error || 'Failed to connect wallet to backend');
                    }
                }
            }
        } catch (error) {
            console.error('Wallet connection error:', error);
            showNotification(error.message, 'error');
        }
    }

    // Check wallet balance using Solana RPC
    async function checkWalletBalance(publicKey) {
        try {
            const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
            const balance = await connection.getBalance(new solanaWeb3.PublicKey(publicKey));
            return balance / solanaWeb3.LAMPORTS_PER_SOL; // Convert lamports to SOL
        } catch (error) {
            console.error('Error checking wallet balance:', error);
            throw new Error('Failed to check wallet balance');
        }
    }

    // Show Phantom import modal when extension is not available
    function showPhantomImportModal() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold text-white">Import Phantom Wallet</h3>
                    <button class="text-gray-400 hover:text-white" onclick="this.closest('.fixed').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <p class="text-gray-300 mb-4">Import an existing wallet with your 12 or 24-word recovery phrase.</p>
                <div class="grid grid-cols-4 gap-2 mb-4">
                    ${Array.from({length: 12}, (_, i) => `
                        <div class="flex items-center">
                            <span class="text-gray-400 text-xs mr-1">${i + 1}.</span>
                            <input type="text" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm" 
                                   placeholder="word" data-word="${i}">
                        </div>
                    `).join('')}
                </div>
                <div class="flex items-center mb-4">
                    <input type="checkbox" id="has24Words" class="mr-2">
                    <label for="has24Words" class="text-gray-300 text-sm">I have a 24-word recovery phrase</label>
                </div>
                <button class="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white transition-colors" 
                        onclick="importPhantomWallet(this)">
                    Import Wallet
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Import Phantom wallet function
    async function importPhantomWallet(button) {
        try {
            button.disabled = true;
            button.textContent = 'Importing...';
            
            const wordInputs = document.querySelectorAll('[data-word]');
            const words = Array.from(wordInputs).map(input => input.value.trim()).filter(word => word);
            
            if (words.length !== 12 && words.length !== 24) {
                throw new Error('Please enter 12 or 24 recovery words');
            }
            
            // Here you would typically use a library like @solana/web3.js to derive the keypair
            // For now, we'll simulate the import process
            showNotification('Wallet import feature requires additional setup. Please install Phantom extension for now.', 'warning');
            
            // Close modal
            button.closest('.fixed').remove();
            
        } catch (error) {
            showNotification(error.message, 'error');
            button.disabled = false;
            button.textContent = 'Import Wallet';
        }
    }

    // Update wallet UI
    function updateWalletUI(walletAddress, walletType, balance = null) {
        const notConnected = document.getElementById('wallet-not-connected');
        const connected = document.getElementById('wallet-connected');
        const walletAddressElement = document.getElementById('wallet-address');
        const walletTypeElement = document.getElementById('wallet-type');
        const walletBalanceElement = document.getElementById('wallet-balance');

        if (notConnected) notConnected.classList.add('hidden');
        if (connected) connected.classList.remove('hidden');
        if (walletAddressElement) {
            walletAddressElement.textContent = walletAddress.substring(0, 8) + '...' + walletAddress.substring(walletAddress.length - 8);
        }
        if (walletTypeElement) {
            walletTypeElement.textContent = `${walletType.charAt(0).toUpperCase() + walletType.slice(1)} Wallet`;
        }
        if (walletBalanceElement && balance !== null) {
            walletBalanceElement.textContent = `${balance.toFixed(4)} SOL`;
        }
    }

    // Disconnect wallet
    async function disconnectWallet() {
        try {
            if (currentWallet && currentWallet.provider) {
                await currentWallet.provider.disconnect();
            }

            // Send disconnect to backend
            await fetch('/api/disconnect-wallet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            walletConnected = false;
            currentWallet = null;

            // Update UI
            const notConnected = document.getElementById('wallet-not-connected');
            const connected = document.getElementById('wallet-connected');

            if (notConnected) notConnected.classList.remove('hidden');
            if (connected) connected.classList.add('hidden');

            // Disable launch buttons
            elements.launchButtons.forEach(btn => {
                btn.disabled = true;
                btn.classList.add('opacity-50');
            });

            showNotification('Wallet disconnected successfully!', 'info');
        } catch (error) {
            console.error('Error disconnecting wallet:', error);
            showNotification('Error disconnecting wallet', 'error');
        }
    }

    // Tab switching
    function switchTab(tabName) {
        // Update navigation buttons
        elements.navTabs.forEach(tab => {
            tab.classList.remove('active', 'bg-blue-600', 'text-white');
            tab.classList.add('bg-gray-700', 'text-gray-300');
        });
        
        const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active', 'bg-blue-600', 'text-white');
            activeTab.classList.remove('bg-gray-700', 'text-gray-300');
        }

        // Hide all tab contents
        elements.tabContents.forEach(content => {
            content.classList.add('hidden');
        });

        // Show selected tab content
        const selectedContent = document.getElementById(`${tabName}-tab`);
        if (selectedContent) {
            selectedContent.classList.remove('hidden');
        }

        // Load tab-specific data
        if (tabName === 'overview') {
            loadOverviewData();
        } else if (tabName === 'trading') {
            loadTradingData();
        } else if (tabName === 'settings') {
            loadSettings();
        } else if (tabName === 'logs') {
            loadLogs();
        }
    }

    // Reset bot state
    function resetBotState() {
        botRunning = false;
        if (elements.botStatus) {
            elements.botStatus.textContent = 'Stopped';
            elements.botStatus.className = 'text-2xl font-bold text-red-400';
        }
        
        elements.launchButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('opacity-50');
        });
    }

    // License validation
    async function validateLicense() {
        const licenseKey = document.getElementById('licenseKey').value.trim();
        
        if (!licenseKey) {
            showNotification('Please enter a license key', 'error');
            return false;
        }

        try {
            const response = await fetch('/api/validate-license', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ licenseKey })
            });

            const result = await response.json();
            
            if (result.valid) {
                return true;
            } else {
                showNotification(result.error || 'Invalid license key', 'error');
                return false;
            }
        } catch (error) {
            console.error('License validation error:', error);
            showNotification('Error validating license', 'error');
            return false;
        }
    }

    // Login with license
    async function loginWithLicense() {
        const isValid = await validateLicense();
        
        if (isValid) {
            const licenseKey = document.getElementById('licenseKey').value.trim();
            
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ licenseKey })
                });

                const result = await response.json();
                
                if (result.success) {
                    userToken = result.token;
                    localStorage.setItem('userToken', userToken);
                    
                    updateLoginStatus(true, result.user);
                    showNotification('Login successful!', 'success');
                    
                    // Enable launch button if wallet is also connected
                    if (walletConnected) {
                        elements.launchButtons.forEach(btn => {
                            btn.disabled = false;
                            btn.classList.remove('opacity-50');
                        });
                    }
                } else {
                    showNotification(result.error || 'Login failed', 'error');
                }
            } catch (error) {
                console.error('Login error:', error);
                showNotification('Error during login', 'error');
            }
        }
    }

    // Show login modal
    function showLoginModal() {
        console.log('Showing login modal...');
        
        // Add visual feedback to login icon
        const loginIcon = document.getElementById('loginIcon');
        if (loginIcon) {
            loginIcon.classList.add('animate-pulse', 'glow');
            setTimeout(() => {
                loginIcon.classList.remove('animate-pulse', 'glow');
            }, 1000);
        }

        // Focus on license key input
        const licenseInput = document.getElementById('licenseKey');
        if (licenseInput) {
            licenseInput.focus();
            licenseInput.classList.add('ring-2', 'ring-green-400');
            setTimeout(() => {
                licenseInput.classList.remove('ring-2', 'ring-green-400');
            }, 2000);
        }

        showNotification('Please enter your license key to access the trading bot', 'info');
    }

    // Handle logout
    function handleLogout() {
        userToken = null;
        localStorage.removeItem('userToken');
        updateLoginStatus(false);
        
        // Disable launch buttons
        elements.launchButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('opacity-50');
        });
        
        showNotification('Logged out successfully', 'info');
    }

    // Check login status
    function checkLoginStatus() {
        const token = localStorage.getItem('userToken');
        if (token) {
            userToken = token;
            // Verify token with backend
            fetch('/api/verify-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token })
            })
            .then(response => response.json())
            .then(result => {
                if (result.valid) {
                    updateLoginStatus(true, result.user);
                } else {
                    handleLogout();
                }
            })
            .catch(() => {
                handleLogout();
            });
        } else {
            updateLoginStatus(false);
        }
    }

    // Update login status UI
    function updateLoginStatus(isLoggedIn, user = null) {
        const userStatus = document.getElementById('userStatus');
        const userInfo = document.getElementById('userInfo');
        const loginIcon = document.getElementById('loginIcon');
        const tradingDashboard = document.getElementById('trading-dashboard');

        if (isLoggedIn && user) {
            if (userStatus) userStatus.classList.remove('hidden');
            if (userInfo) userInfo.textContent = `Welcome, ${user.username}`;
            if (loginIcon) loginIcon.classList.add('hidden');
            if (tradingDashboard) tradingDashboard.classList.remove('hidden');
        } else {
            if (userStatus) userStatus.classList.add('hidden');
            if (loginIcon) loginIcon.classList.remove('hidden');
            if (tradingDashboard) tradingDashboard.classList.add('hidden');
        }
    }

    // Launch trading bot
    async function launchTradingBot() {
        if (!userToken) {
            showNotification('Please login first', 'error');
            return;
        }

        if (!walletConnected) {
            showNotification('Please connect your wallet first', 'error');
            return;
        }

        try {
            showLoadingOverlay();
            
            const response = await fetch('/api/launch-bot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify({
                    walletAddress: currentWallet.address,
                    settings: settings
                })
            });

            const result = await response.json();
            
            if (result.success) {
                botRunning = true;
                if (elements.botStatus) {
                    elements.botStatus.textContent = 'Running';
                    elements.botStatus.className = 'text-2xl font-bold text-green-400';
                }
                
                elements.launchButtons.forEach(btn => {
                    btn.disabled = true;
                    btn.classList.add('opacity-50');
                });
                
                showNotification('Trading bot launched successfully!', 'success');
            } else {
                showNotification(result.error || 'Failed to launch bot', 'error');
            }
        } catch (error) {
            console.error('Launch bot error:', error);
            showNotification('Error launching bot', 'error');
        } finally {
            hideLoadingOverlay();
        }
    }

    // Show wallet modal
    function showWalletModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay fixed inset-0 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="card-bg rounded-lg p-6 w-full max-w-md mx-4">
                <h3 class="text-xl font-bold mb-4 text-blue-400">Connect Wallet</h3>
                <p class="text-gray-300 mb-4">Choose your Solana wallet to connect:</p>
                <div class="space-y-3">
                    <button onclick="connectWallet('phantom')" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded transition-colors">
                        <i class="fas fa-ghost mr-2"></i>Phantom
                    </button>
                    <button onclick="connectWallet('solflare')" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded transition-colors">
                        <i class="fas fa-fire mr-2"></i>Solflare
                    </button>
                    <button onclick="connectWallet('backpack')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors">
                        <i class="fas fa-briefcase mr-2"></i>Backpack
                    </button>
                </div>
                <button onclick="hideWalletModal()" class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded mt-4 transition-colors">
                    Cancel
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Hide wallet modal
    function hideWalletModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

    // Check and display profits
    async function checkAndDisplayProfits() {
        if (!userToken) return;

        try {
            const response = await fetch('/api/trading-stats', {
                headers: {
                    'Authorization': `Bearer ${userToken}`
                }
            });

            const stats = await response.json();
            
            if (stats.totalProfit > 0) {
                addWithdrawButton(stats.totalProfit);
            }
        } catch (error) {
            console.error('Error fetching trading stats:', error);
        }
    }

    // Add withdraw button
    function addWithdrawButton(profit) {
        const existingButton = document.getElementById('withdraw-btn');
        if (existingButton) return;

        const button = document.createElement('button');
        button.id = 'withdraw-btn';
        button.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors';
        button.innerHTML = `<i class="fas fa-download mr-2"></i>Withdraw ${profit.toFixed(4)} SOL`;
        button.onclick = withdrawProfits;

        const quickActions = document.querySelector('.card-bg .flex.flex-wrap.gap-4');
        if (quickActions) {
            quickActions.appendChild(button);
        }
    }

    // Withdraw profits
    async function withdrawProfits() {
        if (!userToken) return;

        try {
            const response = await fetch('/api/withdraw-profits', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userToken}`
                }
            });

            const result = await response.json();
            
            if (result.success) {
                showNotification(`Successfully withdrew ${result.amount} SOL!`, 'success');
                const button = document.getElementById('withdraw-btn');
                if (button) button.remove();
            } else {
                showNotification(result.error || 'Withdrawal failed', 'error');
            }
        } catch (error) {
            console.error('Withdrawal error:', error);
            showNotification('Error processing withdrawal', 'error');
        }
    }

    // Toggle address visibility
    function toggleAddressVisibility() {
        const addressElement = document.getElementById('wallet-address');
        if (addressElement) {
            if (addressElement.textContent.includes('...')) {
                addressElement.textContent = currentWallet.address;
            } else {
                addressElement.textContent = currentWallet.address.substring(0, 8) + '...' + currentWallet.address.substring(currentWallet.address.length - 8);
            }
        }
    }

    // Show notification
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
        
        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            warning: 'bg-yellow-600',
            info: 'bg-blue-600'
        };
        
        notification.className += ` ${colors[type] || colors.info}`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        elements.notificationContainer.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // Auto remove
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    // Hide all modals
    function hideAllModals() {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => modal.remove());
    }

    // Update system metrics
    function updateSystemMetrics() {
        setInterval(() => {
            if (elements.totalProfit) {
                elements.totalProfit.textContent = (Math.random() * 2).toFixed(4) + ' SOL';
            }
            if (elements.tradesToday) {
                elements.tradesToday.textContent = Math.floor(Math.random() * 50);
            }
            if (elements.successRate) {
                elements.successRate.textContent = (Math.random() * 100).toFixed(1) + '%';
            }
        }, 10000);
    }

    // Generate trading data
    function generateTradingData() {
        const tokens = ['SOL', 'BONK', 'SAMO', 'RAY', 'SRM'];
        const actions = ['BUY', 'SELL'];
        const token = tokens[Math.floor(Math.random() * tokens.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const amount = (Math.random() * 0.5).toFixed(4);
        const price = (Math.random() * 100).toFixed(6);
        
        return {
            token,
            action,
            amount,
            price,
            timestamp: new Date().toLocaleTimeString()
        };
    }

    // Update trading data
    function updateTradingData() {
        const recentTrades = document.getElementById('recent-trades');
        if (!recentTrades) return;

        const trade = generateTradingData();
        const tradeElement = document.createElement('div');
        tradeElement.className = 'flex justify-between items-center p-3 bg-gray-800/50 rounded-lg';
        tradeElement.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <i class="fas fa-${trade.action === 'BUY' ? 'arrow-up' : 'arrow-down'} text-white text-xs"></i>
                </div>
                <div>
                    <p class="font-semibold">${trade.token}</p>
                    <p class="text-sm text-gray-400">${trade.action} ${trade.amount} SOL</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-semibold">$${trade.price}</p>
                <p class="text-sm text-gray-400">${trade.timestamp}</p>
            </div>
        `;

        recentTrades.insertBefore(tradeElement, recentTrades.firstChild);
        
        if (recentTrades.children.length > 5) {
            recentTrades.removeChild(recentTrades.lastChild);
        }
    }

    // Update trading table with wallet
    function updateTradingTableWithWallet() {
        if (currentWallet) {
            updateTradingTable();
        }
    }

    // Update trading table
    function updateTradingTable() {
        const tableBody = document.querySelector('#trading-table tbody');
        if (!tableBody) return;

        const newRow = document.createElement('tr');
        newRow.className = 'hover:bg-gray-700';
        
        const trade = generateTradingData();
        newRow.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-3">
                        <i class="fas fa-${trade.action === 'BUY' ? 'arrow-up' : 'arrow-down'} text-white text-xs"></i>
                    </div>
                    <div>
                        <div class="text-sm font-medium text-white">${trade.token}</div>
                        <div class="text-sm text-gray-400">${currentWallet.address.substring(0, 8)}...</div>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${trade.action === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${trade.action}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${trade.amount} SOL</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">$${trade.price}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${trade.timestamp}</td>
        `;

        tableBody.insertBefore(newRow, tableBody.firstChild);
        
        if (tableBody.children.length > 10) {
            tableBody.removeChild(tableBody.lastChild);
        }
    }

    // Start trading simulation
    function startTradingSimulation() {
        setInterval(() => {
            if (botRunning) {
                updateTradingData();
                updateTradingTableWithWallet();
            }
        }, 5000);
    }

    // Setup buy modal
    function setupBuyModal() {
        const buyModal = document.createElement('div');
        buyModal.id = 'buy-modal';
        buyModal.className = 'modal-overlay fixed inset-0 flex items-center justify-center z-50 hidden';
        buyModal.innerHTML = `
            <div class="card-bg rounded-lg p-6 w-full max-w-md mx-4">
                <h3 class="text-xl font-bold mb-4 text-blue-400">Buy Configuration</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">Buy Amount (SOL)</label>
                        <input type="number" id="buy-amount" step="0.01" min="0.01" max="10" value="0.1" 
                               class="w-full bg-gray-800 border border-blue-700 rounded px-4 py-2 focus:border-blue-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 text-gray-300">Slippage (%)</label>
                        <input type="number" id="slippage" min="1" max="50" value="5" 
                               class="w-full bg-gray-800 border border-blue-700 rounded px-4 py-2 focus:border-blue-400 focus:outline-none">
                    </div>
                </div>
                <div class="flex space-x-3 mt-6">
                    <button onclick="executeBuy()" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors">
                        Execute Buy
                    </button>
                    <button onclick="hideBuyModal()" class="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(buyModal);
    }

    // Collect config values
    function collectConfigValues(prefix = '') {
        const config = {};
        const elements = [
            'buy-mode', 'fixed-buy-amount', 'min-buy-amount', 'max-buy-amount',
            'profit-target-1', 'profit-target-2', 'stop-loss', 'min-liquidity',
            'top-10-holders', 'bundled-max', 'max-same-block', 'safety-check-period',
            'min-pool-size', 'require-socials', 'require-liquidity-burnt',
            'require-immutable-metadata', 'require-mint-authority-renounced',
            'require-freeze-authority-renounced', 'only-pump-fun-migrated'
        ];

        elements.forEach(id => {
            const element = document.getElementById(prefix + id);
            if (element) {
                if (element.type === 'checkbox') {
                    config[id] = element.checked;
                } else if (element.type === 'range') {
                    config[id] = parseFloat(element.value);
                } else {
                    config[id] = element.value;
                }
            }
        });

        return config;
    }

    // Setup safety sliders
    function setupSafetySliders() {
        const sliders = [
            { id: 'top-10-holders', valueId: 'top-10-holders-value' },
            { id: 'bundled-max', valueId: 'bundled-max-value' },
            { id: 'max-same-block', valueId: 'max-same-block-value' },
            { id: 'safety-check-period', valueId: 'safety-check-period-value' },
            { id: 'min-pool-size', valueId: 'min-pool-size-value' }
        ];

        sliders.forEach(slider => {
            const sliderElement = document.getElementById(slider.id);
            const valueElement = document.getElementById(slider.valueId);
            
            if (sliderElement && valueElement) {
                sliderElement.addEventListener('input', (e) => {
                    const value = e.target.value;
                    if (slider.id === 'min-pool-size') {
                        valueElement.textContent = `$${(value / 1000).toFixed(0)}K`;
                    } else if (slider.id === 'safety-check-period') {
                        valueElement.textContent = `${value}s`;
                    } else {
                        valueElement.textContent = `${value}%`;
                    }
                });
            }
        });
    }

    // Setup safety checkboxes
    function setupSafetyCheckboxes() {
        const checkboxes = [
            'require-socials', 'require-liquidity-burnt', 'require-immutable-metadata',
            'require-mint-authority-renounced', 'require-freeze-authority-renounced',
            'only-pump-fun-migrated'
        ];

        checkboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    console.log(`${id}: ${e.target.checked}`);
                });
            }
        });
    }

    // Apply config and start bot
    async function applyConfigAndStartBot(config, feedbackId) {
        try {
            const response = await fetch('/api/apply-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            
            if (result.success) {
                showNotification('Configuration applied successfully!', 'success');
                if (feedbackId) {
                    document.getElementById(feedbackId).textContent = 'Configuration applied!';
                }
            } else {
                showNotification(result.error || 'Failed to apply configuration', 'error');
            }
        } catch (error) {
            console.error('Apply config error:', error);
            showNotification('Error applying configuration', 'error');
        }
    }

    // Setup auto sell toggle
    function setupAutoSellToggle(prefix = '', buttonId, checkboxId) {
        const button = document.getElementById(prefix + buttonId);
        const checkbox = document.getElementById(prefix + checkboxId);
        
        if (button && checkbox) {
            function updateBtn() {
                if (checkbox.checked) {
                    button.textContent = 'Auto-Sell: ON';
                    button.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors';
                } else {
                    button.textContent = 'Auto-Sell: OFF';
                    button.className = 'bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors';
                }
            }
            
            checkbox.addEventListener('change', updateBtn);
            updateBtn();
        }
    }

    // Setup config panel
    function setupConfigPanel() {
        const buyModeSelect = document.getElementById('buy-mode');
        const fixedBuySection = document.getElementById('fixed-buy-section');
        const randomBuySection = document.getElementById('random-buy-section');

        if (buyModeSelect && fixedBuySection && randomBuySection) {
            buyModeSelect.addEventListener('change', (e) => {
                if (e.target.value === 'fixed') {
                    fixedBuySection.classList.remove('hidden');
                    randomBuySection.classList.add('hidden');
                } else {
                    fixedBuySection.classList.add('hidden');
                    randomBuySection.classList.remove('hidden');
                }
            });
        }

        setupSafetySliders();
        setupSafetyCheckboxes();
        setupBuyModal();
    }

    // Inject footer
    function injectFooter() {
        const footer = document.createElement('footer');
        footer.className = 'bg-black/50 backdrop-blur-sm border-t border-blue-500/30 mt-12';
        footer.innerHTML = `
            <div class="container mx-auto px-4 py-6">
                <div class="text-center text-gray-400">
                    <p>&copy; 2024 Best Sniper Sol. Professional Solana Trading Bot.</p>
                    <p class="text-sm mt-2">Advanced safety features and real-time trading automation.</p>
                </div>
            </div>
        `;
        document.body.appendChild(footer);
    }

    // Setup dashboard close logic
    function setupDashboardCloseLogic() {
        window.addEventListener('beforeunload', (e) => {
            if (botRunning) {
                e.preventDefault();
                e.returnValue = 'Trading bot is running. Are you sure you want to leave?';
            }
        });
    }

    // Stop trading bot
    async function stopTradingBot() {
        if (!userToken) return;

        try {
            const response = await fetch('/api/stop-bot', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${userToken}`
                }
            });

            const result = await response.json();
            
            if (result.success) {
                botRunning = false;
                if (elements.botStatus) {
                    elements.botStatus.textContent = 'Stopped';
                    elements.botStatus.className = 'text-2xl font-bold text-red-400';
                }
                
                elements.launchButtons.forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('opacity-50');
                });
                
                showNotification('Trading bot stopped successfully!', 'success');
            } else {
                showNotification(result.error || 'Failed to stop bot', 'error');
            }
        } catch (error) {
            console.error('Stop bot error:', error);
            showNotification('Error stopping bot', 'error');
        }
    }

    // Hide loading overlay if ready
    function hideLoadingOverlayIfReady() {
        if (document.readyState === 'complete') {
            hideLoadingOverlay();
        } else {
            window.addEventListener('load', hideLoadingOverlay);
        }
    }

    // Hide loading overlay
    function hideLoadingOverlay() {
        if (elements.loadingOverlay) {
            elements.loadingOverlay.classList.add('hidden');
        }
    }

    // Socket listeners
    function setupSocketListeners() {
        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        socket.on('log', (message) => {
            addLog(message);
        });

        socket.on('trading_data', (data) => {
            handleTradingData(data);
        });

        socket.on('bot_status', (status) => {
            updateBotStatus(status);
        });
    }

    // Add log message
    function addLog(message) {
        if (elements.logContainer) {
            const logEntry = document.createElement('div');
            logEntry.className = 'text-green-400 mb-1';
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            elements.logContainer.appendChild(logEntry);
            elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
            
            logs.push(message);
            if (logs.length > 1000) {
                logs.shift();
            }
        }
    }

    // Handle trading data
    function handleTradingData(data) {
        switch (data.type) {
            case 'new_token':
                addLog(`New token detected: ${data.token.name} (${data.token.symbol}) from ${data.source}`);
                break;
            case 'buy_attempt':
                addLog(`Buying ${data.token.name} (${data.token.symbol}) for ${data.amount} SOL`);
                break;
            case 'buy_success':
                addLog(`Successfully bought ${data.token.name} (${data.token.symbol}) - Tx: ${data.txHash}`);
                break;
            case 'buy_failed':
                addLog(`Failed to buy ${data.token.name} (${data.token.symbol}): ${data.error}`);
                break;
            case 'sell_attempt':
                addLog(`Selling ${data.token.name} (${data.token.symbol}) - Profit: ${data.profit}%`);
                break;
            case 'sell_success':
                addLog(`Successfully sold ${data.token.name} (${data.token.symbol}) - Profit: ${data.profit}% - Tx: ${data.txHash}`);
                break;
            case 'sell_failed':
                addLog(`Failed to sell ${data.token.name} (${data.token.symbol}): ${data.error}`);
                break;
        }
    }

    // Update bot status
    function updateBotStatus(status) {
        botRunning = status.running;
        if (elements.botStatus) {
            elements.botStatus.textContent = status.running ? 'Running' : 'Stopped';
            elements.botStatus.className = `text-2xl font-bold ${status.running ? 'text-green-400' : 'text-red-400'}`;
        }
    }

    // Load overview data
    function loadOverviewData() {
        // This would fetch real data from the backend
        console.log('Loading overview data...');
    }

    // Load trading data
    function loadTradingData() {
        // This would fetch real trading data from the backend
        console.log('Loading trading data...');
    }

    // Load settings
    function loadSettings() {
        // Load current settings from backend
        console.log('Loading settings...');
    }

    // Load logs
    function loadLogs() {
        // Load recent logs from backend
        console.log('Loading logs...');
    }

    // Make functions globally accessible
    window.showLoginModal = showLoginModal;
    window.connectWallet = connectWallet;
    window.disconnectWallet = disconnectWallet;
    window.launchTradingBot = launchTradingBot;
    window.stopTradingBot = stopTradingBot;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(); 