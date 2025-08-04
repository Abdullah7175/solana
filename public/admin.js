(() => {
    let authToken = localStorage.getItem('adminToken');
    let currentUser = null;
    const socket = io();

    // DOM Elements
    const elements = {
        loginScreen: document.getElementById('loginScreen'),
        adminDashboard: document.getElementById('adminDashboard'),
        loginForm: document.getElementById('loginForm'),
        loginUsername: document.getElementById('loginUsername'),
        loginPassword: document.getElementById('loginPassword'),
        loginError: document.getElementById('loginError'),
        adminUsername: document.getElementById('adminUsername'),
        logoutBtn: document.getElementById('logoutBtn'),
        navBtns: document.querySelectorAll('.nav-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        addUserBtn: document.getElementById('addUserBtn'),
        addUserModal: document.getElementById('addUserModal'),
        addUserForm: document.getElementById('addUserForm'),
        cancelAddUser: document.getElementById('cancelAddUser'),
        editUserModal: document.getElementById('editUserModal'),
        editUserForm: document.getElementById('editUserForm'),
        cancelEditUser: document.getElementById('cancelEditUser'),
        usersTableBody: document.getElementById('usersTableBody'),
        licensesTableBody: document.getElementById('licensesTableBody'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn')
    };

    // Initialize
    function init() {
        console.log('Admin panel initializing...');
        
        if (authToken) {
            console.log('Auth token found, validating...');
            validateAuthToken();
        } else {
            console.log('No auth token, showing login');
            showLogin();
        }
        
        setupEventListeners();
        setupSocketListeners();
        
        // Ensure dashboard tab is shown by default if logged in
        if (authToken) {
            setTimeout(() => {
                switchTab('dashboard');
            }, 100);
        }
    }
    
    // Validate auth token
    async function validateAuthToken() {
        try {
            const response = await fetch('/api/admin/validate-token', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.valid) {
                    currentUser = result.user;
                    showDashboard();
                    loadDashboardData();
                } else {
                    handleLogout();
                }
            } else {
                handleLogout();
            }
        } catch (error) {
            console.error('Token validation error:', error);
            handleLogout();
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        // Login form
        elements.loginForm.addEventListener('submit', handleLogin);
        
        // Logout
        elements.logoutBtn.addEventListener('click', handleLogout);
        
        // Navigation
        elements.navBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
        
        // Add user
        elements.addUserBtn.addEventListener('click', showAddUserModal);
        elements.cancelAddUser.addEventListener('click', hideAddUserModal);
        elements.addUserForm.addEventListener('submit', handleAddUser);
        
        // Edit user
        elements.cancelEditUser.addEventListener('click', hideEditUserModal);
        elements.editUserForm.addEventListener('submit', handleEditUser);
        
        // Settings
        elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
        
        // License management
        const cancelEditLicense = document.getElementById('cancelEditLicense');
        const editLicenseForm = document.getElementById('editLicenseForm');
        
        if (cancelEditLicense) cancelEditLicense.addEventListener('click', hideEditLicenseModal);
        if (editLicenseForm) editLicenseForm.addEventListener('submit', handleEditLicense);
        
        // JWT Management
        const showJwtSecret = document.getElementById('showJwtSecret');
        const copyJwtSecret = document.getElementById('copyJwtSecret');
        const generateNewJwt = document.getElementById('generateNewJwt');
        
        if (showJwtSecret) showJwtSecret.addEventListener('click', toggleJwtSecretVisibility);
        if (copyJwtSecret) copyJwtSecret.addEventListener('click', copyJwtSecretToClipboard);
        if (generateNewJwt) generateNewJwt.addEventListener('click', generateNewJwtSecret);
        
        // Bot Testing
        const adminConnectWallet = document.getElementById('adminConnectWallet');
        const adminDisconnectWallet = document.getElementById('adminDisconnectWallet');
        const adminStartBot = document.getElementById('adminStartBot');
        const adminStopBot = document.getElementById('adminStopBot');
        const adminSellAll = document.getElementById('adminSellAll');
        const adminSaveConfig = document.getElementById('adminSaveConfig');
        const adminTestBot = document.getElementById('adminTestBot');
        const testAllApis = document.getElementById('testAllApis');
        const clearLogs = document.getElementById('clearLogs');
        const exportLogs = document.getElementById('exportLogs');
        
        if (adminConnectWallet) adminConnectWallet.addEventListener('click', connectAdminWallet);
        if (adminDisconnectWallet) adminDisconnectWallet.addEventListener('click', disconnectAdminWallet);
        if (adminStartBot) adminStartBot.addEventListener('click', startAdminBot);
        if (adminStopBot) adminStopBot.addEventListener('click', stopAdminBot);
        if (adminSellAll) adminSellAll.addEventListener('click', sellAllAdmin);
        if (adminSaveConfig) adminSaveConfig.addEventListener('click', saveAdminConfig);
        if (adminTestBot) adminTestBot.addEventListener('click', testBotTrading);
        if (testAllApis) testAllApis.addEventListener('click', testAllApis);
        if (clearLogs) clearLogs.addEventListener('click', clearTradingLogs);
        if (exportLogs) exportLogs.addEventListener('click', exportTradingLogs);

        // Payment monitoring event listeners
        const startMonitoringBtn = document.getElementById('start-monitoring-btn');
        if (startMonitoringBtn) {
            startMonitoringBtn.addEventListener('click', startPaymentMonitoring);
        }

        const stopMonitoringBtn = document.getElementById('stop-monitoring-btn');
        if (stopMonitoringBtn) {
            stopMonitoringBtn.addEventListener('click', stopPaymentMonitoring);
        }

        const refreshPaymentsBtn = document.getElementById('refresh-payments-btn');
        if (refreshPaymentsBtn) {
            refreshPaymentsBtn.addEventListener('click', refreshPaymentData);
        }

        const exportPaymentsBtn = document.getElementById('export-payments-btn');
        if (exportPaymentsBtn) {
            exportPaymentsBtn.addEventListener('click', exportPaymentHistory);
        }

        const exportSecurityBtn = document.getElementById('export-security-btn');
        if (exportSecurityBtn) {
            exportSecurityBtn.addEventListener('click', exportSecurityLogs);
        }
    }

    // Setup socket listeners
    function setupSocketListeners() {
        socket.on('connect', () => {
            console.log('Connected to admin panel');
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from admin panel');
        });
        
        socket.on('trading-data', (data) => {
            updateTradingData(data);
        });
        
        // Admin bot specific listeners
        socket.on('log', (message) => {
            addAdminLog(message);
        });
        
        socket.on('admin_new_token', (data) => {
            addAdminLog(`New token detected: ${data.token.name} (${data.token.symbol}) from ${data.source}`);
        });
        
        socket.on('admin_buy_attempt', (data) => {
            addAdminLog(`Attempting to buy ${data.token.name} (${data.token.symbol}) for ${data.amount} SOL`);
        });
        
        socket.on('admin_buy_success', (data) => {
            addAdminLog(`✅ Successfully bought ${data.token.name} (${data.token.symbol}) for ${data.amount} SOL. Tx: ${data.txHash}`);
            updateAdminStats();
        });
        
        socket.on('admin_buy_failed', (data) => {
            addAdminLog(`❌ Failed to buy ${data.token.name} (${data.token.symbol}) for ${data.amount} SOL`);
        });
    }
    
    // Add admin log
    function addAdminLog(message) {
        const logsContainer = document.getElementById('adminTradingLogs');
        if (logsContainer) {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${timestamp}] ${message}`;
            logsContainer.appendChild(logEntry);
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    }
    
    // Update admin stats
    function updateAdminStats() {
        // This would be updated with real data from the backend
        // For now, just increment counters
        const totalTradesElement = document.getElementById('adminTotalTrades');
        if (totalTradesElement) {
            const currentTrades = parseInt(totalTradesElement.textContent) || 0;
            totalTradesElement.textContent = currentTrades + 1;
        }
    }

    // Authentication functions
    async function handleLogin(e) {
        e.preventDefault();
        
        const username = elements.loginUsername.value;
        const password = elements.loginPassword.value;
        
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            
            if (result.success) {
                authToken = result.token;
                currentUser = result.user;
                localStorage.setItem('adminToken', authToken);
                showDashboard();
                loadDashboardData();
            } else {
                showLoginError(result.error || 'Login failed');
            }
        } catch (error) {
            showLoginError('Network error. Please try again.');
        }
    }

    function handleLogout() {
        authToken = null;
        currentUser = null;
        localStorage.removeItem('adminToken');
        showLogin();
    }

    function showLoginError(message) {
        elements.loginError.textContent = message;
        elements.loginError.classList.remove('hidden');
        setTimeout(() => {
            elements.loginError.classList.add('hidden');
        }, 5000);
    }

    // UI functions
    function showLogin() {
        elements.loginScreen.classList.remove('hidden');
        elements.adminDashboard.classList.add('hidden');
    }

    function showDashboard() {
        elements.loginScreen.classList.add('hidden');
        elements.adminDashboard.classList.remove('hidden');
        elements.adminUsername.textContent = currentUser?.username || 'Admin';
    }

    function switchTab(tabName) {
        console.log('Switching to tab:', tabName);
        
        // Update navigation buttons
        elements.navBtns.forEach(btn => {
            btn.classList.remove('active', 'bg-blue-600', 'text-white');
            btn.classList.add('hover:bg-gray-700', 'text-gray-300');
        });
        
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active', 'bg-blue-600', 'text-white');
            activeBtn.classList.remove('hover:bg-gray-700', 'text-gray-300');
        }
        
        // Hide all tab contents
        elements.tabContents.forEach(content => {
            content.classList.add('hidden');
        });
        
        // Show the correct tab content - FIXED TO MATCH HTML IDs
        let tabId = `${tabName}-tab`;
        if (tabName === 'bot-test') {
            tabId = 'bot-test-tab';
        } else if (tabName === 'jwt') {
            tabId = 'jwt-tab';
        }
        
        console.log('Looking for tab with ID:', tabId);
        const activeTab = document.getElementById(tabId);
        if (activeTab) {
            activeTab.classList.remove('hidden');
            console.log('Tab content shown:', tabId);
        } else {
            console.error('Tab content not found:', tabId);
        }
        
        // Load tab-specific data
        switch (tabName) {
            case 'dashboard':
                loadDashboardData();
                break;
            case 'users':
                loadUsers();
                break;
            case 'licenses':
                loadLicenses();
                break;
            case 'payments':
                loadPaymentData();
                break;
            case 'trading':
                loadTradingData();
                break;
            case 'jwt':
                loadJwtStatistics();
                break;
            case 'bot-test':
                // Bot testing tab doesn't need initial data load
                break;
        }
    }

    // Data loading functions
    async function loadDashboardData() {
        console.log('Loading dashboard data...');
        try {
            const response = await fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Dashboard data loaded:', data);
                updateDashboardStats(data);
            } else {
                console.error('Failed to load dashboard data:', response.status, response.statusText);
                showNotification('Failed to load dashboard data', 'error');
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            showNotification('Network error loading dashboard data', 'error');
        }
    }

    function updateDashboardStats(data) {
        const { userStats, tradingStats } = data;
        
        // Update stat cards
        document.getElementById('totalUsers').textContent = userStats.totalUsers;
        document.getElementById('activeUsers').textContent = userStats.activeUsers;
        document.getElementById('activeLicenses').textContent = userStats.activeLicenses;
        document.getElementById('expiredLicenses').textContent = userStats.expiredLicenses;
        
        // Update recent logins
        const recentLoginsContainer = document.getElementById('recentLogins');
        recentLoginsContainer.innerHTML = userStats.recentLogins.map(login => `
            <div class="flex justify-between items-center p-3 bg-gray-700 rounded">
                <div>
                    <p class="font-semibold">${login.username}</p>
                    <p class="text-sm text-gray-400">${login.role}</p>
                </div>
                <p class="text-sm text-gray-400">${new Date(login.lastLogin).toLocaleString()}</p>
            </div>
        `).join('');
        
        // Update trading status
        const tradingStatusContainer = document.getElementById('tradingStatus');
        tradingStatusContainer.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span>Bot Status:</span>
                    <span class="${tradingStats.running ? 'text-green-400' : 'text-red-400'}">
                        ${tradingStats.running ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span>Connected Users:</span>
                    <span>${tradingStats.connectedUsers}</span>
                </div>
                <div class="flex justify-between">
                    <span>Auto Restart:</span>
                    <span class="${tradingStats.autoRestart ? 'text-green-400' : 'text-red-400'}">
                        ${tradingStats.autoRestart ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
            </div>
        `;
    }

    async function loadUsers() {
        console.log('Loading users...');
        try {
            const response = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                const users = await response.json();
                console.log('Users loaded:', users);
                updateUsersTable(users);
            } else {
                console.error('Failed to load users:', response.status, response.statusText);
                showNotification('Failed to load users', 'error');
            }
        } catch (error) {
            console.error('Failed to load users:', error);
            showNotification('Network error loading users', 'error');
        }
    }

    function updateUsersTable(users) {
        elements.usersTableBody.innerHTML = users.map(user => `
            <tr class="hover:bg-gray-700">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-white">${user.username}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-300">${user.email}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }">
                        ${user.role}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }">
                        ${user.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-300">${user.licenseKey || 'N/A'}</div>
                    ${user.licenseExpiry ? `<div class="text-xs text-gray-500">Expires: ${new Date(user.licenseExpiry).toLocaleDateString()}</div>` : ''}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="editUser('${user.username}')" class="text-blue-400 hover:text-blue-300 mr-3">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteUser('${user.username}')" class="text-red-400 hover:text-red-300">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function loadLicenses() {
        console.log('Loading licenses...');
        try {
            const response = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                const users = await response.json();
                console.log('Licenses loaded:', users);
                updateLicensesTable(users);
            } else {
                console.error('Failed to load licenses:', response.status, response.statusText);
                showNotification('Failed to load licenses', 'error');
            }
        } catch (error) {
            console.error('Failed to load licenses:', error);
            showNotification('Network error loading licenses', 'error');
        }
    }

    function updateLicensesTable(users) {
        elements.licensesTableBody.innerHTML = users.map(user => {
            const isExpired = user.licenseExpiry && new Date() > new Date(user.licenseExpiry);
            const packageInfo = PACKAGE_CONFIG[user.package] || PACKAGE_CONFIG.basic;
            const usageText = user.dailyUsage ? `${user.dailyUsage}/${packageInfo.dailyLimit}` : `0/${packageInfo.dailyLimit}`;
            
            return `
                <tr class="hover:bg-gray-700">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-medium text-white">${user.username}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-gray-300">
                            <span class="font-semibold">${packageInfo.name}</span><br>
                            <span class="text-xs text-gray-400">${packageInfo.price}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-mono text-gray-300">${user.licenseKey || 'N/A'}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            isExpired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }">
                            ${isExpired ? 'Expired' : 'Active'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <span class="text-xs">${usageText} daily</span><br>
                        <span class="text-xs text-gray-400">${user.monthlyUsage || 0}/${packageInfo.monthlyLimit} monthly</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        ${user.licenseExpiry ? new Date(user.licenseExpiry).toLocaleDateString() : 'No Expiry'}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onclick="editLicense('${user.username}', '${user.licenseKey}')" class="text-blue-400 hover:text-blue-300 mr-3">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button onclick="deleteLicense('${user.licenseKey}')" class="text-red-400 hover:text-red-300">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function loadTradingData() {
        try {
            const response = await fetch('/api/trading-stats', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                updateTradingOverview(data);
            }
        } catch (error) {
            console.error('Failed to load trading data:', error);
        }
    }

    function updateTradingOverview(data) {
        const botStatusContainer = document.getElementById('botStatus');
        const connectedWalletsContainer = document.getElementById('connectedWallets');
        
        // Update bot status
        botStatusContainer.innerHTML = `
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span>Status:</span>
                    <span class="${data.botStatus.running ? 'text-green-400' : 'text-red-400'}">
                        ${data.botStatus.running ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div class="flex justify-between">
                    <span>Connected Users:</span>
                    <span>${data.botStatus.connectedUsers}</span>
                </div>
                <div class="flex justify-between">
                    <span>Total Profits:</span>
                    <span class="text-green-400">${data.botStatus.totalProfits.toFixed(4)} SOL</span>
                </div>
            </div>
        `;
        
        // Update connected wallets
        connectedWalletsContainer.innerHTML = data.connectedWallets.map(wallet => `
            <div class="flex justify-between items-center p-3 bg-gray-700 rounded">
                <div>
                    <p class="font-semibold">${wallet.userId}</p>
                    <p class="text-sm text-gray-400">${wallet.publicKey.substring(0, 8)}...${wallet.publicKey.substring(-8)}</p>
                </div>
                <span class="text-sm text-gray-400">${wallet.type}</span>
            </div>
        `).join('') || '<p class="text-gray-400">No wallets connected</p>';
    }

    function updateTradingData(data) {
        // Real-time trading data updates
        console.log('Trading data received:', data);
    }

    // Modal functions
    function showAddUserModal() {
        elements.addUserModal.classList.remove('hidden');
        elements.addUserModal.classList.add('flex');
    }

    function hideAddUserModal() {
        elements.addUserModal.classList.add('hidden');
        elements.addUserModal.classList.remove('flex');
        elements.addUserForm.reset();
    }

    function showEditUserModal() {
        elements.editUserModal.classList.remove('hidden');
        elements.editUserModal.classList.add('flex');
    }

    function hideEditUserModal() {
        elements.editUserModal.classList.add('hidden');
        elements.editUserModal.classList.remove('flex');
        elements.editUserForm.reset();
    }

    // User management functions
    async function handleAddUser(e) {
        e.preventDefault();
        
        const formData = new FormData(elements.addUserForm);
        const userData = {
            username: formData.get('username') || document.getElementById('newUsername').value,
            email: formData.get('email') || document.getElementById('newEmail').value,
            password: formData.get('password') || document.getElementById('newPassword').value,
            role: formData.get('role') || document.getElementById('newRole').value,
            licenseExpiry: document.getElementById('newLicenseExpiry').value || null,
            maxConnections: parseInt(document.getElementById('newMaxConnections').value) || 1,
            features: ['basic']
        };
        
        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(userData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                hideAddUserModal();
                loadUsers();
                showNotification('User created successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to create user', 'error');
            }
        } catch (error) {
            showNotification('Network error. Please try again.', 'error');
        }
    }

    async function handleEditUser(e) {
        e.preventDefault();
        
        const username = document.getElementById('editUsername').value;
        const updates = {
            email: document.getElementById('editEmail').value,
            role: document.getElementById('editRole').value,
            isActive: document.getElementById('editStatus').value === 'true',
            licenseExpiry: document.getElementById('editLicenseExpiry').value || null,
            maxConnections: parseInt(document.getElementById('editMaxConnections').value) || 1
        };
        
        const password = document.getElementById('editPassword').value;
        if (password) {
            updates.password = password;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${username}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(updates)
            });
            
            const result = await response.json();
            
            if (result.success) {
                hideEditUserModal();
                loadUsers();
                showNotification('User updated successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to update user', 'error');
            }
        } catch (error) {
            showNotification('Network error. Please try again.', 'error');
        }
    }

    async function deleteUser(username) {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${username}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            const result = await response.json();
            
            if (result.success) {
                loadUsers();
                showNotification('User deleted successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to delete user', 'error');
            }
        } catch (error) {
            showNotification('Network error. Please try again.', 'error');
        }
    }

    async function handleSaveSettings() {
        const settings = {
            jwtSecret: document.getElementById('jwtSecret').value,
            sessionTimeout: parseInt(document.getElementById('sessionTimeout').value)
        };
        
        showNotification('Settings saved successfully', 'success');
    }

    // Utility functions
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        } text-white`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Global functions for table actions
    window.editUser = function(username) {
        // Load user data and populate edit form
        fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        })
        .then(response => response.json())
        .then(users => {
            const user = users.find(u => u.username === username);
            if (user) {
                document.getElementById('editUsername').value = user.username;
                document.getElementById('editEmail').value = user.email;
                document.getElementById('editRole').value = user.role;
                document.getElementById('editStatus').value = user.isActive.toString();
                document.getElementById('editLicenseExpiry').value = user.licenseExpiry ? user.licenseExpiry.slice(0, 16) : '';
                document.getElementById('editMaxConnections').value = user.maxConnections || 1;
                showEditUserModal();
            }
        });
    };

    window.deleteUser = deleteUser;

    // JWT Management Functions
    async function toggleJwtSecretVisibility() {
        const input = document.getElementById('currentJwtSecret');
        const button = document.getElementById('showJwtSecret');
        
        if (input.type === 'password') {
            input.type = 'text';
            button.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            button.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }

    async function copyJwtSecretToClipboard() {
        const input = document.getElementById('currentJwtSecret');
        try {
            await navigator.clipboard.writeText(input.value);
            showNotification('JWT secret copied to clipboard', 'success');
        } catch (err) {
            showNotification('Failed to copy JWT secret', 'error');
        }
    }

    async function generateNewJwtSecret() {
        if (!confirm('This will invalidate all existing tokens. Are you sure?')) {
            return;
        }
        
        try {
            const length = document.getElementById('jwtSecretLength').value;
            const response = await fetch('/api/admin/generate-jwt-secret', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ length: parseInt(length) })
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('currentJwtSecret').value = result.secret;
                showNotification('New JWT secret generated successfully', 'success');
                loadJwtStatistics();
            } else {
                showNotification(result.error || 'Failed to generate JWT secret', 'error');
            }
        } catch (error) {
            showNotification('Error generating JWT secret: ' + error.message, 'error');
        }
    }

    async function loadJwtStatistics() {
        try {
            const response = await fetch('/api/admin/jwt-stats', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const stats = await response.json();
            
            document.getElementById('activeTokens').textContent = stats.activeTokens || 0;
            document.getElementById('expiredTokens').textContent = stats.expiredTokens || 0;
            document.getElementById('totalTokens').textContent = stats.totalTokens || 0;
            document.getElementById('lastGenerated').textContent = stats.lastGenerated || '-';
        } catch (error) {
            console.error('Error loading JWT statistics:', error);
        }
    }

    // Bot Testing Functions
    async function connectAdminWallet() {
        try {
            if ('solana' in window) {
                const provider = window.solana;

                if (provider.isPhantom) {
                    try {
                        const resp = await provider.connect(); // Triggers Phantom extension popup
                        const publicKey = resp.publicKey.toString();
                        console.log('Connected admin wallet:', publicKey);
                        
                        document.getElementById('adminWalletStatus').classList.remove('hidden');
                        document.getElementById('adminWalletAddress').textContent = publicKey;
                        
                        // Send admin wallet to server
                        await fetch('/api/admin/connect-wallet', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${authToken}`
                            },
                            body: JSON.stringify({
                                publicKey: publicKey,
                                walletType: 'phantom'
                            })
                        });
                        
                        showNotification('Admin wallet connected successfully', 'success');
                    } catch (err) {
                        console.error('User rejected the connection or Phantom is locked', err);
                        showNotification('User rejected the connection or Phantom is locked', 'error');
                    }
                } else {
                    showNotification('Phantom Wallet not detected. Please install it.', 'error');
                }
            } else {
                showNotification('Phantom Wallet not available. Please install the extension.', 'error');
            }
        } catch (error) {
            showNotification('Failed to connect admin wallet: ' + error.message, 'error');
        }
    }

    async function disconnectAdminWallet() {
        try {
            if ('solana' in window && window.solana.isPhantom) {
                await window.solana.disconnect();
            }
            
            // Hide wallet status
            document.getElementById('adminWalletStatus').classList.add('hidden');
            document.getElementById('adminWalletAddress').textContent = '';
            
            // Send disconnect to server
            await fetch('/api/admin/disconnect-wallet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            showNotification('Admin wallet disconnected successfully', 'success');
        } catch (error) {
            console.error('Error disconnecting admin wallet:', error);
            showNotification('Error disconnecting admin wallet: ' + error.message, 'error');
        }
    }

    // Admin Bot Control Functions
    async function startAdminBot() {
        try {
            showNotification('Starting admin bot...', 'info');
            
            const response = await fetch('/api/admin/start-bot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('adminBotStatus').textContent = 'Running';
                document.getElementById('adminBotStatus').className = 'text-2xl font-bold text-green-400';
                showNotification('Admin bot started successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to start admin bot', 'error');
            }
        } catch (error) {
            showNotification('Error starting admin bot: ' + error.message, 'error');
        }
    }

    async function stopAdminBot() {
        try {
            showNotification('Stopping admin bot...', 'info');
            
            const response = await fetch('/api/admin/stop-bot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('adminBotStatus').textContent = 'Stopped';
                document.getElementById('adminBotStatus').className = 'text-2xl font-bold text-red-400';
                showNotification('Admin bot stopped successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to stop admin bot', 'error');
            }
        } catch (error) {
            showNotification('Error stopping admin bot: ' + error.message, 'error');
        }
    }

    async function sellAllAdmin() {
        try {
            showNotification('Selling all positions...', 'info');
            
            const response = await fetch('/api/admin/sell-all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('All positions sold successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to sell all positions', 'error');
            }
        } catch (error) {
            showNotification('Error selling all positions: ' + error.message, 'error');
        }
    }

    async function saveAdminConfig() {
        try {
            const config = {
                buyAmount: parseFloat(document.getElementById('adminBuyAmount').value),
                profitTarget: parseFloat(document.getElementById('adminProfitTarget').value),
                stopLoss: parseFloat(document.getElementById('adminStopLoss').value),
                minLiquidity: parseFloat(document.getElementById('adminMinLiquidity').value)
            };
            
            const response = await fetch('/api/admin/save-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(config)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Configuration saved successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to save configuration', 'error');
            }
        } catch (error) {
            showNotification('Error saving configuration: ' + error.message, 'error');
        }
    }

    async function testBotTrading() {
        try {
            showNotification('Starting bot test...', 'info');
            
            const response = await fetch('/api/admin/test-bot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('Bot test started successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to start bot test', 'error');
            }
        } catch (error) {
            showNotification('Error starting bot test: ' + error.message, 'error');
        }
    }

    async function testAllApis() {
        const apis = [
            { name: 'pumpApiStatus', url: 'https://pumpapi.fun/api/get_newer_mints', params: { limit: 1 } },
            { name: 'dexApiStatus', url: 'https://api.dexscreener.com/latest/dex/pairs/solana' },
            { name: 'birdeyeApiStatus', url: 'https://birdeye.so/token/11111111111111111111111111111112' }
        ];
        
        for (const api of apis) {
            const statusElement = document.getElementById(api.name);
            if (statusElement) {
                statusElement.textContent = 'Testing...';
                statusElement.className = 'text-sm px-2 py-1 rounded bg-yellow-600';
                
                try {
                    let url = api.url;
                    if (api.params) {
                        const params = new URLSearchParams(api.params);
                        url += '?' + params.toString();
                    }
                    
                    // Use a proxy approach to avoid CORS issues
                    const response = await fetch('/api/test-external-api', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({
                            url: url,
                            apiName: api.name
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        statusElement.textContent = '✅ Online';
                        statusElement.className = 'text-sm px-2 py-1 rounded bg-green-600';
                    } else {
                        throw new Error(result.error || 'API test failed');
                    }
                } catch (error) {
                    console.error(`API test failed for ${api.name}:`, error);
                    statusElement.textContent = '❌ Offline';
                    statusElement.className = 'text-sm px-2 py-1 rounded bg-red-600';
                }
            }
        }
        
        showNotification('API testing completed', 'info');
    }

    function clearTradingLogs() {
        document.getElementById('adminTradingLogs').textContent = '';
        showNotification('Trading logs cleared', 'info');
    }

    function exportTradingLogs() {
        const logs = document.getElementById('adminTradingLogs').textContent;
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trading-logs-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Trading logs exported', 'success');
    }

    // Package configuration
    const PACKAGE_CONFIG = {
        basic: {
            name: 'Basic Package',
            price: '$50/month',
            dailyLimit: 50,
            monthlyLimit: 1500,
            maxBuyAmount: 0.1,
            features: ['Basic safety checks']
        },
        pro: {
            name: 'Pro Package',
            price: '$150/month',
            dailyLimit: 200,
            monthlyLimit: 6000,
            maxBuyAmount: 0.5,
            features: ['Advanced safety checks', 'Priority support']
        },
        premium: {
            name: 'Premium Package',
            price: '$500/month',
            dailyLimit: 1000,
            monthlyLimit: 30000,
            maxBuyAmount: 2.0,
            features: ['All safety checks', 'Custom settings']
        },
        enterprise: {
            name: 'Enterprise Package',
            price: '$1,500/month',
            dailyLimit: -1, // Unlimited
            monthlyLimit: -1, // Unlimited
            maxBuyAmount: 10.0,
            features: ['All features', 'Custom development']
        }
    };

    // License management functions
    function showEditLicenseModal(username, licenseKey) {
        document.getElementById('editLicenseUsername').value = username;
        document.getElementById('editLicenseKey').value = licenseKey;
        
        // Load current license data
        fetch('/api/admin/licenses', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        })
        .then(response => response.json())
        .then(licenses => {
            const license = licenses.find(l => l.username === username);
            if (license) {
                document.getElementById('editLicensePackage').value = license.package || 'basic';
                document.getElementById('editDailyLimit').value = license.dailyLimit || 50;
                document.getElementById('editMonthlyLimit').value = license.monthlyLimit || 1500;
                document.getElementById('editMaxBuyAmount').value = license.maxBuyAmount || 0.1;
                document.getElementById('editLicenseExpiry').value = license.expiresAt ? license.expiresAt.slice(0, 16) : '';
                document.getElementById('editLicenseStatus').value = license.isActive.toString();
            }
        });
        
        document.getElementById('editLicenseModal').classList.remove('hidden');
        document.getElementById('editLicenseModal').classList.add('flex');
    }

    function hideEditLicenseModal() {
        document.getElementById('editLicenseModal').classList.add('hidden');
        document.getElementById('editLicenseModal').classList.remove('flex');
    }

    async function handleEditLicense(e) {
        e.preventDefault();
        
        const username = document.getElementById('editLicenseUsername').value;
        const licenseKey = document.getElementById('editLicenseKey').value;
        const packageType = document.getElementById('editLicensePackage').value;
        const dailyLimit = parseInt(document.getElementById('editDailyLimit').value);
        const monthlyLimit = parseInt(document.getElementById('editMonthlyLimit').value);
        const maxBuyAmount = parseFloat(document.getElementById('editMaxBuyAmount').value);
        const expiresAt = document.getElementById('editLicenseExpiry').value;
        const isActive = document.getElementById('editLicenseStatus').value === 'true';
        
        try {
            const response = await fetch(`/api/admin/licenses/${licenseKey}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    package: packageType,
                    dailyLimit,
                    monthlyLimit,
                    maxBuyAmount,
                    expiresAt,
                    isActive
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                hideEditLicenseModal();
                loadLicenses();
                showNotification('License updated successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to update license', 'error');
            }
        } catch (error) {
            showNotification('Network error. Please try again.', 'error');
        }
    }

    async function deleteLicense(licenseKey) {
        if (!confirm('Are you sure you want to delete this license?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/licenses/${licenseKey}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            const result = await response.json();
            
            if (result.success) {
                loadLicenses();
                showNotification('License deleted successfully', 'success');
            } else {
                showNotification(result.error || 'Failed to delete license', 'error');
            }
        } catch (error) {
            showNotification('Network error. Please try again.', 'error');
        }
    }

    // Global functions for license actions
    window.editLicense = showEditLicenseModal;
    window.deleteLicense = deleteLicense;
    window.startPaymentMonitoring = startPaymentMonitoring;
    window.stopPaymentMonitoring = stopPaymentMonitoring;
    window.refreshPaymentData = refreshPaymentData;
    window.exportPaymentHistory = exportPaymentHistory;
    window.exportSecurityLogs = exportSecurityLogs;

    // Payment monitoring functions
    async function loadPaymentData() {
        console.log('Loading payment data...');
        try {
            // Load payment status
            const statusResponse = await fetch('/api/payment-status', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (statusResponse.ok) {
                const status = await statusResponse.json();
                updatePaymentStatus(status);
            }

            // Load payment history
            const historyResponse = await fetch('/api/payment-history', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (historyResponse.ok) {
                const history = await historyResponse.json();
                updatePaymentHistoryTable(history.history);
            }

            // Load security logs
            const logsResponse = await fetch('/api/security-logs', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (logsResponse.ok) {
                const logs = await logsResponse.json();
                updateSecurityLogsTable(logs.logs);
            }
        } catch (error) {
            console.error('Failed to load payment data:', error);
            showNotification('Failed to load payment data', 'error');
        }
    }

    function updatePaymentStatus(status) {
        const monitoringStatus = document.getElementById('monitoring-status');
        const totalPayments = document.getElementById('total-payments');
        const securityEvents = document.getElementById('security-events');
        const clientWallet = document.getElementById('client-wallet');

        if (monitoringStatus) {
            monitoringStatus.textContent = status.isMonitoring ? 'Active' : 'Inactive';
            monitoringStatus.className = status.isMonitoring ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
        }

        if (totalPayments) {
            totalPayments.textContent = status.totalPayments || 0;
        }

        if (securityEvents) {
            securityEvents.textContent = status.securityEvents || 0;
        }

        if (clientWallet) {
            clientWallet.textContent = status.clientWallet || 'Not configured';
        }
    }

    function updatePaymentHistoryTable(history) {
        const tbody = document.getElementById('paymentHistoryTableBody');
        if (!tbody) return;

        if (!history || history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-4 text-center text-gray-400">
                        <i class="fas fa-credit-card text-2xl mb-2"></i>
                        <p>No payments recorded yet</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = history.map(payment => {
            const timestamp = new Date(payment.timestamp).toLocaleString();
            const shortAddress = payment.senderAddress.substring(0, 8) + '...' + payment.senderAddress.substring(payment.senderAddress.length - 8);
            const shortTx = payment.transactionSignature.substring(0, 16) + '...';
            
            return `
                <tr class="hover:bg-gray-700">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${timestamp}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-300">${shortAddress}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-green-400 font-semibold">${payment.amount} SOL</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            ${payment.package.toUpperCase()}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            payment.action === 'new_user' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }">
                            ${payment.action === 'new_user' ? 'New User' : 'Upgrade'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400">${shortTx}</td>
                </tr>
            `;
        }).join('');
    }

    function updateSecurityLogsTable(logs) {
        const tbody = document.getElementById('securityLogsTableBody');
        if (!tbody) return;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-4 text-center text-gray-400">
                        <i class="fas fa-shield-alt text-2xl mb-2"></i>
                        <p>No security events recorded yet</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString();
            const shortTx = log.signature ? log.signature.substring(0, 16) + '...' : 'N/A';
            
            const levelColors = {
                'INFO': 'bg-blue-100 text-blue-800',
                'WARNING': 'bg-yellow-100 text-yellow-800',
                'ERROR': 'bg-red-100 text-red-800',
                'BLOCKED': 'bg-red-100 text-red-800',
                'UPGRADE': 'bg-green-100 text-green-800',
                'NEW_USER': 'bg-green-100 text-green-800',
                'FEE_COLLECTED': 'bg-purple-100 text-purple-800'
            };

            return `
                <tr class="hover:bg-gray-700">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${timestamp}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${levelColors[log.level] || 'bg-gray-100 text-gray-800'}">
                            ${log.level}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-300">${log.message}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400">${shortTx}</td>
                </tr>
            `;
        }).join('');
    }

    // Payment control functions
    async function startPaymentMonitoring() {
        try {
            const response = await fetch('/api/payment/start-monitoring', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                showNotification('Payment monitoring started', 'success');
                loadPaymentData(); // Refresh data
            } else {
                showNotification('Failed to start payment monitoring', 'error');
            }
        } catch (error) {
            console.error('Start monitoring error:', error);
            showNotification('Error starting payment monitoring', 'error');
        }
    }

    async function stopPaymentMonitoring() {
        try {
            const response = await fetch('/api/payment/stop-monitoring', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                showNotification('Payment monitoring stopped', 'success');
                loadPaymentData(); // Refresh data
            } else {
                showNotification('Failed to stop payment monitoring', 'error');
            }
        } catch (error) {
            console.error('Stop monitoring error:', error);
            showNotification('Error stopping payment monitoring', 'error');
        }
    }

    async function refreshPaymentData() {
        showNotification('Refreshing payment data...', 'info');
        await loadPaymentData();
        showNotification('Payment data refreshed', 'success');
    }

    async function exportPaymentHistory() {
        try {
            const response = await fetch('/api/payment/export-history', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'payment_history.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showNotification('Payment history exported successfully', 'success');
            } else {
                showNotification('Failed to export payment history', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Error exporting payment history', 'error');
        }
    }

    async function exportSecurityLogs() {
        try {
            const response = await fetch('/api/payment/export-security-logs', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'security_logs.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showNotification('Security logs exported successfully', 'success');
            } else {
                showNotification('Failed to export security logs', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Error exporting security logs', 'error');
        }
    }

    // Initialize the application
    init();
})(); 