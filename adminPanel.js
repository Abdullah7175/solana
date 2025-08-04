import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const USERS_FILE = './users.json';
const LICENSES_FILE = './licenses.json';
const JWT_SECRET = process.env.JWT_SECRET || 'soul-spark-admin-secret-key-2024';

// Initialize files if they don't exist
const initializeFiles = () => {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({
      admin: {
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        email: 'admin@soulspark.com',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        isActive: true
      }
    }, null, 2));
  }
  
  if (!fs.existsSync(LICENSES_FILE)) {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify({}, null, 2));
  }
};

// Load users from file
const loadUsers = () => {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading users:', error);
    return {};
  }
};

// Save users to file
const saveUsers = (users) => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving users:', error);
    return false;
  }
};

// Load licenses from file
const loadLicenses = () => {
  try {
    const data = fs.readFileSync(LICENSES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading licenses:', error);
    return {};
  }
};

// Save licenses to file
const saveLicenses = (licenses) => {
  try {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(licenses, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving licenses:', error);
    return false;
  }
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      username: user.username, 
      role: user.role,
      userId: user.username 
    }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  const user = verifyToken(token);
  if (!user) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
  
  req.user = user;
  next();
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// User authentication
const authenticateUser = async (username, password) => {
  const users = loadUsers();
  const user = users[username];
  
  if (!user || !user.isActive) {
    return { success: false, message: 'Invalid credentials or account disabled' };
  }
  
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return { success: false, message: 'Invalid credentials' };
  }
  
  // Update last login
  user.lastLogin = new Date().toISOString();
  saveUsers(users);
  
  const token = generateToken(user);
  
  return {
    success: true,
    token,
    user: {
      username: user.username,
      role: user.role,
      email: user.email,
      lastLogin: user.lastLogin
    }
  };
};

// Create new user
const createUser = async (userData) => {
  const users = loadUsers();
  
  if (users[userData.username]) {
    return { success: false, message: 'Username already exists' };
  }
  
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  
  const newUser = {
    username: userData.username,
    password: hashedPassword,
    role: userData.role || 'user',
    email: userData.email,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    isActive: true,
    licenseKey: generateLicenseKey(),
    licenseExpiry: userData.licenseExpiry || null,
    maxConnections: userData.maxConnections || 1,
    features: userData.features || ['basic']
  };
  
  users[userData.username] = newUser;
  
  if (saveUsers(users)) {
    // Create license
    const licenses = loadLicenses();
    licenses[newUser.licenseKey] = {
      username: userData.username,
      createdAt: new Date().toISOString(),
      expiresAt: userData.licenseExpiry,
      isActive: true,
      maxConnections: newUser.maxConnections,
      features: newUser.features
    };
    saveLicenses(licenses);
    
    return {
      success: true,
      message: 'User created successfully',
      user: {
        username: newUser.username,
        role: newUser.role,
        email: newUser.email,
        licenseKey: newUser.licenseKey,
        licenseExpiry: newUser.licenseExpiry,
        maxConnections: newUser.maxConnections,
        features: newUser.features
      }
    };
  } else {
    return { success: false, message: 'Failed to create user' };
  }
};

// Update user
const updateUser = async (username, updates) => {
  const users = loadUsers();
  const user = users[username];
  
  if (!user) {
    return { success: false, message: 'User not found' };
  }
  
  // Update allowed fields
  if (updates.email) user.email = updates.email;
  if (updates.role) user.role = updates.role;
  if (updates.isActive !== undefined) user.isActive = updates.isActive;
  if (updates.maxConnections) user.maxConnections = updates.maxConnections;
  if (updates.features) user.features = updates.features;
  if (updates.licenseExpiry) user.licenseExpiry = updates.licenseExpiry;
  
  // Update password if provided
  if (updates.password) {
    user.password = await bcrypt.hash(updates.password, 10);
  }
  
  if (saveUsers(users)) {
    // Update license if needed
    if (updates.licenseExpiry || updates.maxConnections || updates.features) {
      const licenses = loadLicenses();
      const license = licenses[user.licenseKey];
      if (license) {
        if (updates.licenseExpiry) license.expiresAt = updates.licenseExpiry;
        if (updates.maxConnections) license.maxConnections = updates.maxConnections;
        if (updates.features) license.features = updates.features;
        saveLicenses(licenses);
      }
    }
    
    return {
      success: true,
      message: 'User updated successfully',
      user: {
        username: user.username,
        role: user.role,
        email: user.email,
        isActive: user.isActive,
        licenseKey: user.licenseKey,
        licenseExpiry: user.licenseExpiry,
        maxConnections: user.maxConnections,
        features: user.features,
        lastLogin: user.lastLogin
      }
    };
  } else {
    return { success: false, message: 'Failed to update user' };
  }
};

// Delete user
const deleteUser = async (username) => {
  const users = loadUsers();
  const user = users[username];
  
  if (!user) {
    return { success: false, message: 'User not found' };
  }
  
  delete users[username];
  
  if (saveUsers(users)) {
    // Remove license
    const licenses = loadLicenses();
    if (licenses[user.licenseKey]) {
      delete licenses[user.licenseKey];
      saveLicenses(licenses);
    }
    
    return { success: true, message: 'User deleted successfully' };
  } else {
    return { success: false, message: 'Failed to delete user' };
  }
};

// Get all users
const getAllUsers = () => {
  const users = loadUsers();
  const userList = Object.values(users).map(user => ({
    username: user.username,
    role: user.role,
    email: user.email,
    isActive: user.isActive,
    licenseKey: user.licenseKey,
    licenseExpiry: user.licenseExpiry,
    maxConnections: user.maxConnections,
    features: user.features,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin
  }));
  
  return userList;
};

// Generate license key
const generateLicenseKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) result += '-';
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Validate license
const validateLicense = (licenseKey) => {
  const licenses = loadLicenses();
  const license = licenses[licenseKey];
  
  if (!license || !license.isActive) {
    return { valid: false, message: 'Invalid or inactive license' };
  }
  
  if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
    return { valid: false, message: 'License expired' };
  }
  
  return {
    valid: true,
    license: {
      username: license.username,
      maxConnections: license.maxConnections,
      features: license.features,
      expiresAt: license.expiresAt
    }
  };
};

// Get user statistics
const getUserStats = () => {
  const users = loadUsers();
  const licenses = loadLicenses();
  
  const stats = {
    totalUsers: Object.keys(users).length,
    activeUsers: Object.values(users).filter(u => u.isActive).length,
    totalLicenses: Object.keys(licenses).length,
    activeLicenses: Object.values(licenses).filter(l => l.isActive).length,
    expiredLicenses: Object.values(licenses).filter(l => l.expiresAt && new Date() > new Date(l.expiresAt)).length,
    usersByRole: {},
    recentLogins: []
  };
  
  // Count users by role
  Object.values(users).forEach(user => {
    stats.usersByRole[user.role] = (stats.usersByRole[user.role] || 0) + 1;
  });
  
  // Get recent logins
  const recentUsers = Object.values(users)
    .filter(u => u.lastLogin)
    .sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin))
    .slice(0, 10);
  
  stats.recentLogins = recentUsers.map(u => ({
    username: u.username,
    lastLogin: u.lastLogin,
    role: u.role
  }));
  
  return stats;
};

// JWT Management Functions
const generateNewJwtSecret = (length = 64) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Update JWT secret in environment or config file
  process.env.JWT_SECRET = result;
  
  // Save to a config file for persistence
  const configPath = './jwt-config.json';
  fs.writeFileSync(configPath, JSON.stringify({
    jwtSecret: result,
    generatedAt: new Date().toISOString(),
    length: length
  }, null, 2));
  
  return result;
};

const getJwtStatistics = () => {
  const licenses = loadLicenses();
  const users = loadUsers();
  
  const totalTokens = Object.keys(licenses).length;
  const activeTokens = Object.values(licenses).filter(license => license.isActive).length;
  const expiredTokens = Object.values(licenses).filter(license => 
    license.expiresAt && new Date(license.expiresAt) < new Date()
  ).length;
  
  // Get last generated time from config file
  let lastGenerated = '-';
  try {
    const configPath = './jwt-config.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      lastGenerated = config.generatedAt ? new Date(config.generatedAt).toLocaleString() : '-';
    }
  } catch (error) {
    console.error('Error reading JWT config:', error);
  }
  
  return {
    totalTokens,
    activeTokens,
    expiredTokens,
    lastGenerated
  };
};

const getCurrentJwtSecret = () => {
  try {
    const configPath = './jwt-config.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.jwtSecret || JWT_SECRET;
    }
  } catch (error) {
    console.error('Error reading JWT config:', error);
  }
  return JWT_SECRET;
};

// License management functions
const getAllLicenses = () => {
  const users = loadUsers();
  const licenses = loadLicenses();
  
  return Object.keys(licenses).map(licenseKey => {
    const license = licenses[licenseKey];
    const user = users[license.username];
    
    return {
      licenseKey,
      username: license.username,
      package: user?.package || 'basic',
      dailyLimit: user?.dailyLimit || 50,
      monthlyLimit: user?.monthlyLimit || 1500,
      maxBuyAmount: user?.maxBuyAmount || 0.1,
      dailyUsage: user?.dailyUsage || 0,
      monthlyUsage: user?.monthlyUsage || 0,
      isActive: license.isActive,
      expiresAt: license.expiresAt,
      createdAt: license.createdAt
    };
  });
};

const updateLicense = (licenseKey, updates) => {
  const licenses = loadLicenses();
  const users = loadUsers();
  
  if (!licenses[licenseKey]) {
    return { success: false, message: 'License not found' };
  }
  
  const license = licenses[licenseKey];
  const user = users[license.username];
  
  if (!user) {
    return { success: false, message: 'User not found' };
  }
  
  // Update user with new package settings
  if (updates.package) {
    user.package = updates.package;
  }
  if (updates.dailyLimit !== undefined) {
    user.dailyLimit = updates.dailyLimit;
  }
  if (updates.monthlyLimit !== undefined) {
    user.monthlyLimit = updates.monthlyLimit;
  }
  if (updates.maxBuyAmount !== undefined) {
    user.maxBuyAmount = updates.maxBuyAmount;
  }
  
  // Update license
  if (updates.expiresAt !== undefined) {
    license.expiresAt = updates.expiresAt;
  }
  if (updates.isActive !== undefined) {
    license.isActive = updates.isActive;
  }
  
  // Save changes
  if (saveUsers(users) && saveLicenses(licenses)) {
    return { success: true, message: 'License updated successfully' };
  } else {
    return { success: false, message: 'Failed to save changes' };
  }
};

const deleteLicense = (licenseKey) => {
  const licenses = loadLicenses();
  const users = loadUsers();
  
  if (!licenses[licenseKey]) {
    return { success: false, message: 'License not found' };
  }
  
  const license = licenses[licenseKey];
  
  // Remove license
  delete licenses[licenseKey];
  
  // Remove user if exists
  if (users[license.username]) {
    delete users[license.username];
  }
  
  // Save changes
  if (saveLicenses(licenses) && saveUsers(users)) {
    return { success: true, message: 'License deleted successfully' };
  } else {
    return { success: false, message: 'Failed to delete license' };
  }
};

// Initialize files on module load
initializeFiles();

export default {
  authenticateUser,
  createUser,
  updateUser,
  deleteUser,
  getAllUsers,
  validateLicense,
  getUserStats,
  authenticateToken,
  requireAdmin,
  generateToken,
  verifyToken,
  generateNewJwtSecret,
  getJwtStatistics,
  getCurrentJwtSecret,
  getAllLicenses,
  updateLicense,
  deleteLicense
}; 