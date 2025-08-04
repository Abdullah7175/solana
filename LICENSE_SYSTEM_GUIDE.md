# 🔑 License System Guide - Soul Spark Trading Bot

## 📋 **Complete User Flow**

### **Step 1: Admin Creates Users & Licenses**

#### **Access Admin Panel:**
1. Go to: `http://your-domain/admin.html`
2. Login with:
   - **Username:** `admin`
   - **Password:** `admin123`

#### **Create New User:**
1. Click **"Add User"** button in the admin panel
2. Fill in user details:
   - **Username:** (e.g., "john_doe")
   - **Email:** (e.g., "john@example.com")
   - **Password:** (user's password)
   - **Role:** "user"
   - **License Expiry:** (optional - set expiration date)
   - **Max Connections:** (how many devices can use this license)
3. Click **"Create User"**
4. **Copy the generated License Key** (e.g., "ABCD-1234-EFGH-5678")

### **Step 2: User Logs In with License**

#### **User Gets License Key:**
- Admin provides the license key to the user
- User enters the license key in the main interface

#### **User Login Process:**
1. **Click the login icon** in the header (user icon)
2. **Enter license key** in the "License Key" field
3. **Click "Login with License"** button
4. **Success!** User is now logged in and can access trading features

## 🎯 **Where to Enter License Key**

### **Location in Interface:**
- **Tab:** Home tab
- **Section:** Bot configuration form
- **Field:** "License Key" input field
- **Button:** "Login with License" button

### **Visual Guide:**
```
┌─────────────────────────────────────┐
│           SOUL | SPARK              │
│  [👤 Login Icon] Not Logged In     │ ← Click this icon
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│        Bot Configuration            │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ License Key                     │ │ ← Enter license here
│ │ [ABCD-1234-EFGH-5678]          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [🔑 Login with License]             │ ← Click this button
│                                     │
│ [🚀 Launch Trading Bot]             │ ← This becomes enabled
└─────────────────────────────────────┘
```

## 🔧 **Admin Panel Features**

### **Dashboard Overview:**
- **Total Users:** Number of registered users
- **Active Users:** Currently logged in users
- **Active Licenses:** Valid license count
- **Expired Licenses:** Expired license count

### **User Management:**
- **Create Users:** Add new users with custom licenses
- **Edit Users:** Modify user details and permissions
- **Delete Users:** Remove users and their licenses
- **View User Activity:** See login history and usage

### **License Management:**
- **Auto-Generated Keys:** Unique license keys for each user
- **Expiration Control:** Set license expiration dates
- **Connection Limits:** Control how many devices can use one license
- **Feature Access:** Different license tiers with different features

## 📊 **License Key Format**

### **Example License Keys:**
```
ABCD-1234-EFGH-5678
WXYZ-9876-MNOP-4321
QRST-5555-UVWX-9999
```

### **License Information:**
- **Format:** 4 groups of 4 characters separated by hyphens
- **Uniqueness:** Each license is unique and auto-generated
- **Validation:** Server-side validation ensures authenticity
- **Expiration:** Can be set to expire on specific dates

## 🚀 **Complete Workflow Example**

### **Admin Side:**
1. **Login to Admin Panel** (`/admin.html`)
2. **Create User:**
   - Username: `trader_john`
   - Email: `john@trading.com`
   - Password: `secure123`
   - License Expiry: `2024-12-31`
   - Max Connections: `3`
3. **Get License Key:** `ABCD-1234-EFGH-5678`
4. **Send to User:** Provide license key to John

### **User Side:**
1. **Visit Main Interface** (`/`)
2. **Click Login Icon** in header
3. **Enter License Key:** `ABCD-1234-EFGH-5678`
4. **Click "Login with License"**
5. **Success!** Can now use trading bot

## 🔒 **Security Features**

### **License Validation:**
- **Server-side verification** of all license keys
- **Expiration checking** prevents use of expired licenses
- **Connection limiting** prevents license sharing
- **JWT tokens** for secure session management

### **User Isolation:**
- **Separate wallets** for each user
- **Individual trading history** per user
- **Role-based access** control
- **Session management** with automatic logout

## 💡 **Tips for Admins**

### **Creating Users:**
1. **Use descriptive usernames** (e.g., `trader_john_2024`)
2. **Set reasonable expiration dates** (e.g., 30-90 days)
3. **Limit connections** based on user needs (1-5 devices)
4. **Monitor usage** through admin dashboard

### **Managing Licenses:**
1. **Track active licenses** in admin dashboard
2. **Renew expired licenses** before they expire
3. **Revoke licenses** for inactive users
4. **Generate reports** on user activity

## 🆘 **Troubleshooting**

### **Common Issues:**

#### **"Invalid License Key" Error:**
- Check if license key is entered correctly
- Verify license hasn't expired
- Contact admin to check license status

#### **"License Expired" Error:**
- Contact admin to renew license
- Admin can extend expiration date in admin panel

#### **"Max Connections Reached" Error:**
- Logout from other devices
- Contact admin to increase connection limit

#### **"Login Failed" Error:**
- Check internet connection
- Try refreshing the page
- Contact support if issue persists

## 📞 **Support**

### **For Users:**
- **License Issues:** Contact your admin
- **Technical Problems:** Check browser console for errors
- **Trading Questions:** Refer to FAQ section

### **For Admins:**
- **User Management:** Use admin panel features
- **System Issues:** Check server logs
- **Security Concerns:** Review access logs in admin panel

---

**This license system provides complete control over user access while maintaining security and scalability for your trading bot platform.** 