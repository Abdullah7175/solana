(() => {
    const socket = io();
    let currentTab = 'home';
    let walletConnected = false;
    let tradingActive = false;
    let tradingData = [];
    let tradingInterval = null;
    let rowsLimit = 59;

    // DOM Elements
    const elements = {
        navTabs: document.querySelectorAll('.nav-tab'),
        tabContents: document.querySelectorAll('.tab-content'),
        tradingModal: document.getElementById('trading-modal'),
        walletModal: document.getElementById('wallet-modal'),
        dashboardModal: document.getElementById('dashboard-modal'),
        launchButtons: document.querySelectorAll('#launch-bot, #launch-bot-2'),
        connectWalletBtn: document.getElementById('connect-wallet-btn'),
        walletOptions: document.querySelectorAll('.wallet-option'),
        closeWalletModal: document.getElementById('close-wallet-modal'),
        stopBot: document.getElementById('stop-bot'),
        showAddress: document.getElementById('show-address'),
        tradingTableBody: document.getElementById('trading-table-body')
    };

    // Check if Phantom wallet is available
    function checkPhantomWallet() {
        if (window.solana && window.solana.isPhantom) {
            console.log('Phantom wallet detected');
            // Update UI to show Phantom is available
            const phantomBtn = document.querySelector('[data-wallet="phantom"]');
            if (phantomBtn) {
                phantomBtn.classList.remove('opacity-50');
                phantomBtn.classList.add('hover:bg-blue-600');
            }
        } else {
            console.log('Phantom wallet not detected');
            // Update UI to show Phantom is not available
            const phantomBtn = document.querySelector('[data-wallet="phantom"]');
            if (phantomBtn) {
                phantomBtn.classList.add('opacity-50');
                phantomBtn.classList.remove('hover:bg-blue-600');
            }
        }
    }

    // Initialize the application
    function init() {
        setupEventListeners();
        updateSystemMetrics();
        generateTradingData();
        setInterval(updateSystemMetrics, 5000);
        setInterval(updateTradingData, 3000);
        
        // Check for Phantom wallet
        checkPhantomWallet();
        
        // Listen for wallet changes
        if (window.solana) {
            window.solana.on('connect', () => {
                console.log('Wallet connected');
                checkPhantomWallet();
            });
            
            window.solana.on('disconnect', () => {
                console.log('Wallet disconnected');
                walletConnected = false;
                checkPhantomWallet();
            });
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
        });

        // Wallet connection
        elements.connectWalletBtn.addEventListener('click', showWalletModal);
        elements.walletOptions.forEach(option => {
            option.addEventListener('click', () => connectWallet(option.dataset.wallet));
        });
        elements.closeWalletModal.addEventListener('click', hideWalletModal);

        // Dashboard controls
        elements.stopBot.addEventListener('click', stopTradingBot);
        elements.showAddress.addEventListener('click', toggleAddressVisibility);

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

    // Tab switching functionality
    function switchTab(tabName) {
        // Update navigation
        elements.navTabs.forEach(tab => {
            tab.classList.remove('active', 'border-green-400', 'text-green-400');
            tab.classList.add('border-transparent');
        });

        const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
        activeTab.classList.add('active', 'border-green-400', 'text-green-400');
        activeTab.classList.remove('border-transparent');

        // Update content
        elements.tabContents.forEach(content => {
            content.classList.add('hidden');
        });

        const activeContent = document.getElementById(`${tabName}-tab`);
        activeContent.classList.remove('hidden');

        currentTab = tabName;
    }

    // --- Bot State Management ---
    function resetBotState() {
        tradingData = [];
        tradingActive = false;
        if (tradingInterval) {
            clearInterval(tradingInterval);
            tradingInterval = null;
        }
        // Reset status boxes
        const statusElement = document.querySelector('.bg-green-600, .bg-red-600');
        if (statusElement) {
            statusElement.textContent = 'Working...';
            statusElement.classList.remove('bg-red-600');
            statusElement.classList.add('bg-green-600');
        }
        const sidebarStatus = document.querySelectorAll('.sidebar-status');
        sidebarStatus.forEach(el => {
            el.textContent = 'Working...';
            el.classList.remove('bg-red-600');
            el.classList.add('bg-green-600');
        });
        // Clear trading table
        updateTradingTable();
        // Reset Bought/Sold counter
        const boughtSoldEls = document.querySelectorAll('.bought-sold-counter');
        boughtSoldEls.forEach(el => {
            el.textContent = `0/${rowsLimit}`;
        });
        // Clear error messages
        const feedback = document.getElementById('bot-config-feedback');
        if (feedback) feedback.textContent = '';
    }

    // --- Launch trading bot ---
    function launchTradingBot() {
        resetBotState();
        tradingActive = true;
        // Show trading initialization modal
        elements.tradingModal.classList.remove('hidden');
        setTimeout(() => {
            elements.tradingModal.classList.add('hidden');
            elements.dashboardModal.classList.remove('hidden');
            // Start generating trading data
            startTradingSimulation();
            // Set status to Working...
            const statusElement = document.querySelector('.bg-green-600, .bg-red-600');
            if (statusElement) {
                statusElement.textContent = 'Working...';
                statusElement.classList.remove('bg-red-600');
                statusElement.classList.add('bg-green-600');
            }
            const sidebarStatus = document.querySelectorAll('.sidebar-status');
            sidebarStatus.forEach(el => {
                el.textContent = 'Working...';
                el.classList.remove('bg-red-600');
                el.classList.add('bg-green-600');
            });
        }, 1500);
    }

    // Show wallet connection modal (from dashboard)
    function showWalletModal() {
        elements.dashboardModal.classList.add('hidden');
        elements.walletModal.classList.remove('hidden');
    }

    // Hide wallet connection modal
    function hideWalletModal() {
        elements.walletModal.classList.add('hidden');
        // If trading is active, return to dashboard
        if (tradingActive) {
            elements.dashboardModal.classList.remove('hidden');
        }
    }

    // Connect wallet (real wallet extension integration for Phantom)
    async function connectWallet(walletType) {
        if (walletType === 'phantom') {
            // Check if Phantom wallet is installed
            if (window.solana && window.solana.isPhantom) {
                try {
                    console.log('Phantom wallet detected, attempting connection...');
                    
                    // Request connection to Phantom wallet
                    const resp = await window.solana.connect();
                    console.log('Wallet connected:', resp);
                    
                    // Update UI
                    walletConnected = true;
                    elements.connectWalletBtn.textContent = 'Connected';
                    elements.connectWalletBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                    elements.connectWalletBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                    
                    // Display wallet address
                    const walletAddress = resp.publicKey.toString();
                    document.getElementById('wallet-address').textContent = walletAddress;
                    
                    // Fetch and display balance
                    try {
                        const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
                        const balance = await connection.getBalance(resp.publicKey);
                        const solBalance = (balance / 1e9).toFixed(4);
                        document.getElementById('wallet-balance').textContent = solBalance + ' SOL';
                        console.log('Balance fetched:', solBalance, 'SOL');
                    } catch (balanceError) {
                        console.error('Error fetching balance:', balanceError);
                        document.getElementById('wallet-balance').textContent = 'Balance unavailable';
                    }
                    
                    // Update trading table
                    updateTradingTableWithWallet();
                    
                    // Show success message
                    showNotification('Phantom wallet connected successfully!', 'success');
                    
                } catch (err) {
                    console.error('Wallet connection failed:', err);
                    showNotification('Wallet connection failed: ' + err.message, 'error');
                }
            } else {
                console.log('Phantom wallet not found');
                showNotification('Phantom Wallet not found. Please install the Phantom extension from https://phantom.app/', 'error');
                
                // Open Phantom installation page
                setTimeout(() => {
                    if (confirm('Would you like to install Phantom Wallet?')) {
                        window.open('https://phantom.app/', '_blank');
                    }
                }, 1000);
            }
        } else {
            showNotification(`Connecting to ${walletType} wallet... (integration coming soon)`, 'info');
        }
        hideWalletModal();
    }

    // Toggle address visibility
    function toggleAddressVisibility() {
        const addressElement = document.getElementById('wallet-address');
        const showButton = document.getElementById('show-address');
        
        if (addressElement.textContent === '******') {
            addressElement.textContent = '8bXf8Rg3u4Prz71LgKR5mpa7aMe2F4cSKYYRctmqro6x';
            showButton.textContent = '[Hide]';
        } else {
            addressElement.textContent = '******';
            showButton.textContent = '[Show]';
        }
    }

    // Show notification
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 translate-x-full`;
        
        // Set colors based on type
        switch(type) {
            case 'success':
                notification.className += ' bg-green-600 text-white';
                break;
            case 'error':
                notification.className += ' bg-red-600 text-white';
                break;
            case 'warning':
                notification.className += ' bg-yellow-600 text-white';
                break;
            default:
                notification.className += ' bg-blue-600 text-white';
        }
        
        notification.innerHTML = `
            <div class="flex items-center">
                <span class="mr-2">${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // Auto remove after 5 seconds
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
        elements.tradingModal.classList.add('hidden');
        elements.walletModal.classList.add('hidden');
        elements.dashboardModal.classList.add('hidden');
    }

    // Update system metrics
    function updateSystemMetrics() {
        if (!tradingActive) return;

        // Simulate changing metrics
        const cpu = (Math.random() * 30 + 40).toFixed(1);
        const memory = Math.floor(Math.random() * 50 + 150);
        const latency = (Math.random() * 5 + 8).toFixed(1);
        const buyTime = `${(Math.random() * 0.1).toFixed(2)}s - ${(Math.random() * 0.1).toFixed(2)}s`;

        document.getElementById('cpu-usage').textContent = `${cpu}%`;
        document.getElementById('memory-usage').textContent = `${memory}MB`;
        document.getElementById('network-latency').textContent = `${latency}ms`;
        document.getElementById('buy-time').textContent = buyTime;
    }

    // --- Trading Data Generation ---
    function generateTradingData() {
        const baseTime = new Date();
        tradingData = [];
        for (let i = 0; i < Math.min(6, rowsLimit); i++) {
            const time = new Date(baseTime.getTime() - (i * 5000));
            tradingData.push({
                name: 'Connect Wallet (Connect Wallet)',
                symbol: 'token...oken',
                address: '8bXf8Rg3u4Prz71LgKR5mpa7aMe2F4cSKYYRctmqro6x',
                launch: time.toLocaleTimeString(),
                speed: (Math.random() * 0.1).toFixed(2),
                status: 'PLEASE CONNECT'
            });
        }
        updateTradingTable();
    }

    function updateTradingData() {
        if (!tradingActive) return;
        // Add new trading entry
        const newEntry = {
            name: walletConnected ? 'New Token (NEW)' : 'Connect Wallet (Connect Wallet)',
            symbol: walletConnected ? 'new...token' : 'token...oken',
            address: '8bXf8Rg3u4Prz71LgKR5mpa7aMe2F4cSKYYRctmqro6x',
            launch: new Date().toLocaleTimeString(),
            speed: (Math.random() * 0.1).toFixed(2),
            status: walletConnected ? 'BUYING...' : 'PLEASE CONNECT'
        };
        tradingData.unshift(newEntry);
        // Keep only up to rowsLimit entries
        if (tradingData.length > rowsLimit) {
            tradingData = tradingData.slice(0, rowsLimit);
        }
        updateTradingTable();
    }

    // Update trading table with wallet connected
    function updateTradingTableWithWallet() {
        tradingData.forEach(entry => {
            entry.name = 'New Token (NEW)';
            entry.symbol = 'new...token';
            entry.status = 'BUYING...';
        });
        updateTradingTable();
    }

    // Update trading table display
    function updateTradingTable() {
        if (!elements.tradingTableBody) return;

        elements.tradingTableBody.innerHTML = tradingData.map(entry => `
            <tr class="border-b border-gray-700">
                <td class="py-2 px-2">
                    <div>${entry.name}</div>
                    <div class="text-xs text-gray-400">${entry.symbol}</div>
                </td>
                <td class="py-2 px-2">${entry.launch}</td>
                <td class="py-2 px-2">
                    Seen (${entry.speed}s): ${walletConnected ? 'BUYING' : 'PLEASE CONNECT'}
                </td>
                <td class="py-2 px-2">
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full ${walletConnected ? 'bg-green-400' : 'bg-red-400'} mr-2"></div>
                        ${entry.status}
                    </div>
                </td>
            </tr>
        `).join('');

        // Update Bought/Sold counter
        const boughtSoldEls = document.querySelectorAll('.bought-sold-counter');
        boughtSoldEls.forEach(el => {
            el.textContent = `${tradingData.length}/${rowsLimit}`;
        });
    }

    // --- Trading Simulation ---
    function startTradingSimulation() {
        // Start with empty trading data
        tradingData = [];
        updateTradingTable();
        if (tradingInterval) clearInterval(tradingInterval);
        tradingInterval = setInterval(() => {
            if (!tradingActive) return;
            if (tradingData.length >= rowsLimit) {
                stopTradingBot();
                return;
            }
            updateTradingData();
        }, 3000);
    }

    // Socket.io event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    socket.on('log', (message) => {
        console.log('Log message:', message);
        // You can add log display functionality here
    });

    // Prices tab: Buy modal logic
    function setupBuyModal() {
        // Delegate event for buy buttons
        document.body.addEventListener('click', function(e) {
            if (e.target.classList.contains('buy-btn')) {
                const pkg = e.target.getAttribute('data-package') || '';
                document.getElementById('selected-package').textContent = pkg;
                document.getElementById('buy-modal').classList.remove('hidden');
            }
            if (e.target.id === 'close-buy-modal') {
                document.getElementById('buy-modal').classList.add('hidden');
            }
        });
    }

    // Helper: Collect config values from a given form prefix
    function collectConfigValues(prefix = '') {
        return {
            executor: document.getElementById(`config-executor${prefix}`).value,
            speed: document.getElementById(`config-speed${prefix}`).value,
            buyMin: parseFloat(document.getElementById(`config-buy-min${prefix}`).value),
            buyMax: parseFloat(document.getElementById(`config-buy-max${prefix}`).value),
            intervalMin: parseFloat(document.getElementById(`config-interval-min${prefix}`).value),
            intervalMax: parseFloat(document.getElementById(`config-interval-max${prefix}`).value),
            slippage: parseFloat(document.getElementById(`config-slippage${prefix}`).value),
            devAllocation: parseInt(document.getElementById(`config-dev-allocation${prefix}`).value),
            takeProfit: parseInt(document.getElementById(`config-take-profit${prefix}`).value),
            stopLoss: parseInt(document.getElementById(`config-stop-loss${prefix}`).value),
            autoSell: document.getElementById(`config-auto-sell${prefix}`).checked
        };
    }

    // Helper: Send config to backend and start bot
    async function applyConfigAndStartBot(config, feedbackId) {
        const feedback = document.getElementById(feedbackId);
        feedback.textContent = 'Saving settings...';
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!res.ok) throw new Error('Failed to save settings');
            feedback.textContent = 'Settings saved. Starting bot...';
            const startRes = await fetch('/api/start', { method: 'POST' });
            if (!startRes.ok) throw new Error('Failed to start bot');
            feedback.textContent = 'Bot started successfully!';
            // Optionally launch the bot UI here
        } catch (err) {
            feedback.textContent = 'Error: ' + err.message;
        }
    }

    // Enable/disable Launch button based on auto-sell checkbox
    function setupAutoSellToggle(prefix = '', buttonId, checkboxId) {
        const btn = document.getElementById(buttonId);
        const chk = document.getElementById(checkboxId);
        if (!btn || !chk) return;
        function updateBtn() {
            btn.disabled = !chk.checked;
            if (chk.checked) {
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
        chk.addEventListener('change', updateBtn);
        updateBtn();
    }

    // Setup config panel logic (shared, always visible)
    function setupConfigPanel() {
        const form = document.getElementById('bot-config-form');
        if (form) {
            document.getElementById('launch-bot').onclick = () => {
                const config = collectConfigValues('');
                applyConfigAndStartBot(config, 'bot-config-feedback');
            };
            setupAutoSellToggle('', 'launch-bot', 'config-auto-sell');
        }
    }

    // Inject global footer with FAQ box
    function injectFooter() {
        const footer = document.getElementById('footer');
        if (!footer) return;
        footer.innerHTML = `
        <footer class="w-full bg-gray-900 border-t border-blue-500/20 mt-12 py-8 px-4">
            <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                <div>
                    <div class="flex justify-center mb-2"><i class="fas fa-bullseye text-green-400 text-2xl"></i></div>
                    <h4 class="font-bold mb-1 text-green-400">How fast can the bot detect new tokens?</h4>
                    <p class="text-gray-400 text-sm">Our bot can detect new token launches in as little as 0.01 seconds, giving you a significant advantage over manual traders who typically see new listings after 60+ seconds.</p>
                </div>
                <div>
                    <div class="flex justify-center mb-2"><i class="fas fa-shield-alt text-green-400 text-2xl"></i></div>
                    <h4 class="font-bold mb-1 text-green-400">Is my wallet safe?</h4>
                    <p class="text-gray-400 text-sm">Yes, your wallet is never stored on our servers. It's only used locally in your browser to sign transactions and is never transmitted to us or any third parties.</p>
                </div>
                <div>
                    <div class="flex justify-center mb-2"><i class="fas fa-pencil-alt text-green-400 text-2xl"></i></div>
                    <h4 class="font-bold mb-1 text-green-400">Can I customize the trading strategy?</h4>
                    <p class="text-gray-400 text-sm">Yes, you can customize take profit percentages, stop loss levels, buying amounts, and many other parameters to match your trading style and risk tolerance.</p>
                </div>
            </div>
            <div class="text-center text-gray-500 text-xs mt-8">&copy; 2025 SOUL SPARK Bot | MEV BOT.</div>
        </footer>
        `;
    }

    // --- Dashboard close logic ---
    function setupDashboardCloseLogic() {
        const closeBtn = document.getElementById('close-dashboard-btn');
        const closeConfirmModal = document.getElementById('close-confirm-modal');
        const cancelCloseBtn = document.getElementById('cancel-close-dashboard');
        const confirmCloseBtn = document.getElementById('confirm-close-dashboard');
        const dashboardModal = elements.dashboardModal;

        if (closeBtn && closeConfirmModal && cancelCloseBtn && confirmCloseBtn && dashboardModal) {
            closeBtn.onclick = function() {
                closeConfirmModal.classList.remove('hidden');
            };
            cancelCloseBtn.onclick = function() {
                closeConfirmModal.classList.add('hidden');
            };
            confirmCloseBtn.onclick = function() {
                closeConfirmModal.classList.add('hidden');
                dashboardModal.classList.add('hidden');
                resetBotState();
            };
        }
    }

    // --- Stop trading bot ---
    function stopTradingBot() {
        tradingActive = false;
        if (tradingInterval) {
            clearInterval(tradingInterval);
            tradingInterval = null;
        }
        // Update status in sidebar and top
        const statusElement = document.querySelector('.bg-green-600, .bg-red-600');
        if (statusElement) {
            statusElement.textContent = 'Stopped';
            statusElement.classList.remove('bg-green-600');
            statusElement.classList.add('bg-red-600');
        }
        const sidebarStatus = document.querySelectorAll('.sidebar-status');
        sidebarStatus.forEach(el => {
            el.textContent = 'Stopped';
            el.classList.remove('bg-green-600');
            el.classList.add('bg-red-600');
        });
    }

    // Hide loading overlay when app is ready, but wait at least 2 seconds
    let loadingOverlayMinTimePassed = false;
    let loadingOverlayAppReady = false;
    function hideLoadingOverlayIfReady() {
        if (loadingOverlayMinTimePassed && loadingOverlayAppReady) {
            const overlay = document.getElementById('app-loading-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.style.display = 'none'; }, 600);
            }
        }
    }
    setTimeout(() => {
        loadingOverlayMinTimePassed = true;
        hideLoadingOverlayIfReady();
    }, 2000);
    function hideLoadingOverlay() {
        loadingOverlayAppReady = true;
        hideLoadingOverlayIfReady();
    }

    // Initialize the application when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init();
            injectFooter();
            setupBuyModal();
            setupConfigPanel();
            setupDashboardCloseLogic();
            hideLoadingOverlay();
        });
    } else {
        init();
        injectFooter();
        setupBuyModal();
        setupConfigPanel();
        setupDashboardCloseLogic();
        hideLoadingOverlay();
    }

    // Export functions for global access if needed
    window.BestSniperSol = {
        switchTab,
        launchTradingBot,
        stopTradingBot,
        connectWallet,
        hideAllModals
    };
})(); 