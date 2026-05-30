const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ============ INITIALIZE SUPABASE ============
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const ADMIN_PASSWORD = 'adminkeyzer';

const activeSessions = new Map();

console.log('✅ Server starting...');

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
    res.json({ 
        message: 'OPay Backend API is running!',
        status: 'ok'
    });
});

// ============ GET BALANCE ============
app.post('/api/get-balance', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('account_balance')
            .eq('email', email)
            .single();
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            balance: data?.account_balance || 70000.00 
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ UPDATE BALANCE ============
app.post('/api/update-balance', async (req, res) => {
    const { email, amount, operation } = req.body;
    
    try {
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('account_balance')
            .eq('email', email)
            .single();
        
        if (fetchError) throw fetchError;
        
        let newBalance = user.account_balance || 70000.00;
        
        if (operation === 'add') {
            newBalance += amount;
        } else if (operation === 'deduct') {
            newBalance -= amount;
        }
        
        if (newBalance < 0) {
            return res.json({ success: false, message: 'Insufficient balance' });
        }
        
        const { error: updateError } = await supabase
            .from('users')
            .update({ account_balance: newBalance })
            .eq('email', email);
        
        if (updateError) throw updateError;
        
        res.json({ success: true, balance: newBalance });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ GET USER PROFILE ============
app.post('/api/get-profile', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('account_number, account_name, email, nickname, gender, date_of_birth, address, profile_picture, phone_number')
            .eq('email', email)
            .single();
        
        if (error) throw error;
        
        res.json({ success: true, profile: data });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ UPDATE USER PROFILE ============
app.post('/api/update-profile', async (req, res) => {
    const { email, nickname, gender, date_of_birth, address, phone_number } = req.body;
    
    try {
        const { error } = await supabase
            .from('users')
            .update({
                nickname: nickname || null,
                gender: gender || null,
                date_of_birth: date_of_birth || null,
                address: address || null,
                phone_number: phone_number || null,
                updated_at: new Date().toISOString()
            })
            .eq('email', email);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ UPDATE PROFILE PICTURE ============
app.post('/api/update-profile-picture', async (req, res) => {
    const { email, profile_picture } = req.body;
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ profile_picture: profile_picture })
            .eq('email', email);
        
        if (error) throw error;
        
        res.json({ success: true, message: 'Profile picture updated' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ GET USER BY ACCOUNT NUMBER ============
app.post('/api/get-user-by-account', async (req, res) => {
    const { account_number } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('account_number, account_name, email')
            .eq('account_number', account_number)
            .maybeSingle();
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            exists: !!data,
            user: data
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ RESOLVE ACCOUNT NAME FOR ANY BANK (UPDATED) ============
app.post('/api/resolve-account', async (req, res) => {
    console.log('📞 Resolve account:', req.body.account_number, 'Bank:', req.body.bank_code);
    const { account_number, bank_code } = req.body;
    
    // If no bank_code provided or bank_code is 'opay', use OPay's code
    let bankCode = bank_code;
    if (!bankCode || bankCode === 'opay' || bankCode === 'OPay') {
        bankCode = '999992'; // OPay bank code
    }
    
    try {
        const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bankCode}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('Paystack response:', data.status ? 'Success' : 'Failed');
        
        if (data.status) {
            res.json({
                success: true,
                account_name: data.data.account_name,
                account_number: data.data.account_number,
                bank_name: data.data.bank_name
            });
        } else {
            res.json({
                success: false,
                message: data.message || 'Account not found'
            });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.json({ success: false, message: 'Network error' });
    }
});

// ============ DIGITAL WALLETS / NEO BANKS LIST ============
const DIGITAL_WALLETS = [
    { code: '999992', name: 'OPay', logo: 'images/opay.png' },
    { code: '50324', name: 'Moniepoint', logo: 'https://moniepoint.com/images/logo.svg' },
    { code: '53322', name: 'PalmPay', logo: 'https://palmpay.com/images/logo.png' },
    { code: '53543', name: 'Paga', logo: 'https://www.paga.com/images/logo.png' },
    { code: '50211', name: 'Kuda Bank', logo: 'https://kuda.com/logo.png' },
    { code: '50223', name: 'Carbon', logo: 'https://carbon.africa/logo.png' },
    { code: '50325', name: 'V Bank', logo: 'https://vbank.ng/logo.png' },
    { code: '50327', name: 'Sparkle', logo: 'https://sparkle.ng/logo.png' },
    { code: '50328', name: 'Rubies Bank', logo: 'https://rubiesbank.com/logo.png' },
    { code: '51333', name: 'FairMoney', logo: 'https://fairmoney.ng/logo.png' },
    { code: '50244', name: 'Renmoney', logo: 'https://renmoney.com/logo.png' },
    { code: '50255', name: 'Mintyn', logo: 'https://mintyn.com/logo.png' },
    { code: '50266', name: 'Chipper Cash', logo: 'https://chipper.cash/logo.png' },
    { code: '50277', name: 'Barter', logo: 'https://barter.africa/logo.png' },
    { code: '50288', name: 'Flutterwave', logo: 'https://flutterwave.com/logo.png' },
    { code: '50299', name: 'Paystack', logo: 'https://paystack.com/logo.png' },
    { code: '50300', name: 'Interswitch', logo: 'https://interswitch.com/logo.png' }
];

// ============ GET ALL BANKS (Traditional + Digital Wallets) ============
app.get('/api/banks', async (req, res) => {
    try {
        const response = await fetch('https://api.paystack.co/bank', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.status) {
            // Filter Nigerian traditional banks
            const traditionalBanks = data.data
                .filter(bank => bank.country === 'Nigeria')
                .map(bank => ({
                    code: bank.code,
                    name: bank.name,
                    slug: bank.slug,
                    type: 'traditional'
                }));
            
            // Combine traditional banks with digital wallets
            const digitalWalletsFormatted = DIGITAL_WALLETS.map(wallet => ({
                code: wallet.code,
                name: wallet.name,
                slug: wallet.name.toLowerCase().replace(/\s/g, '-'),
                type: 'digital'
            }));
            
            const allBanks = [...traditionalBanks, ...digitalWalletsFormatted];
            
            res.json({ success: true, banks: allBanks });
        } else {
            // Fallback: return only digital wallets if Paystack fails
            const digitalWalletsFormatted = DIGITAL_WALLETS.map(wallet => ({
                code: wallet.code,
                name: wallet.name,
                slug: wallet.name.toLowerCase().replace(/\s/g, '-'),
                type: 'digital'
            }));
            res.json({ success: true, banks: digitalWalletsFormatted });
        }
    } catch (error) {
        console.error('Error fetching banks:', error);
        // Fallback: return digital wallets
        const digitalWalletsFormatted = DIGITAL_WALLETS.map(wallet => ({
            code: wallet.code,
            name: wallet.name,
            slug: wallet.name.toLowerCase().replace(/\s/g, '-'),
            type: 'digital'
        }));
        res.json({ success: true, banks: digitalWalletsFormatted });
    }
});

// ============ GET BANKS WITH LOGOS ============
app.get('/api/banks-with-logos', async (req, res) => {
    // Traditional bank logos mapping
    const bankLogos = {
        'Access Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Access_Bank_logo.svg/200px-Access_Bank_logo.svg.png',
        'Citibank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Citibank_logo.svg/200px-Citibank_logo.svg.png',
        'Ecobank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Ecobank_Logo.svg/200px-Ecobank_Logo.svg.png',
        'Fidelity Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Fidelity_Bank_Nigeria_logo.svg/200px-Fidelity_Bank_Nigeria_logo.svg.png',
        'First Bank of Nigeria': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/First_Bank_of_Nigeria_logo.svg/200px-First_Bank_of_Nigeria_logo.svg.png',
        'FCMB': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/FCMB_logo.svg/200px-FCMB_logo.svg.png',
        'GTBank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Guaranty_Trust_Bank_logo.svg/200px-Guaranty_Trust_Bank_logo.svg.png',
        'Polaris Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Polaris_Bank_logo.svg/200px-Polaris_Bank_logo.svg.png',
        'Stanbic IBTC Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Stanbic_IBTC_Bank_logo.svg/200px-Stanbic_IBTC_Bank_logo.svg.png',
        'Sterling Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Sterling_Bank_logo.svg/200px-Sterling_Bank_logo.svg.png',
        'Union Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Union_Bank_of_Nigeria_logo.svg/200px-Union_Bank_of_Nigeria_logo.svg.png',
        'United Bank for Africa': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/United_Bank_for_Africa_logo.svg/200px-United_Bank_for_Africa_logo.svg.png',
        'Unity Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png',
        'Wema Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Wema_Bank_logo.svg/200px-Wema_Bank_logo.svg.png',
        'Zenith Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Zenith_Bank_logo.svg/200px-Zenith_Bank_logo.svg.png',
        'Jaiz Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png',
        'Heritage Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png',
        'Keystone Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png',
        'Providus Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png',
        'Titan Trust Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png',
        'Globus Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png',
        'SunTrust Bank': 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png'
    };
    
    try {
        const response = await fetch('https://api.paystack.co/bank', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        let traditionalBanks = [];
        if (data.status) {
            traditionalBanks = data.data
                .filter(bank => bank.country === 'Nigeria')
                .map(bank => ({
                    code: bank.code,
                    name: bank.name,
                    logo: bankLogos[bank.name] || 'https://cdn-icons-png.flaticon.com/512/1108/1108564.png'
                }));
        }
        
        // Digital wallets with their logos
        const digitalWalletsWithLogos = DIGITAL_WALLETS.map(wallet => ({
            code: wallet.code,
            name: wallet.name,
            logo: wallet.logo
        }));
        
        const allBanks = [...traditionalBanks, ...digitalWalletsWithLogos];
        
        res.json({ success: true, banks: allBanks });
    } catch (error) {
        console.error('Error:', error);
        // Return only digital wallets as fallback
        const digitalWalletsWithLogos = DIGITAL_WALLETS.map(wallet => ({
            code: wallet.code,
            name: wallet.name,
            logo: wallet.logo
        }));
        res.json({ success: true, banks: digitalWalletsWithLogos });
    }
});

// ============ ADMIN FUNCTIONS ============
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        const sessionToken = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        activeSessions.set(sessionToken, {
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000
        });
        
        res.json({ 
            success: true, 
            message: 'Login successful',
            sessionToken: sessionToken
        });
    } else {
        res.json({ success: false, message: 'Invalid admin password' });
    }
});

function verifyAdminSession(req, res, next) {
    const sessionToken = req.headers['x-admin-token'];
    
    if (!sessionToken) {
        return res.status(401).json({ success: false, message: 'Admin session required' });
    }
    
    const session = activeSessions.get(sessionToken);
    
    if (!session) {
        return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }
    
    if (Date.now() > session.expiresAt) {
        activeSessions.delete(sessionToken);
        return res.status(401).json({ success: false, message: 'Session expired' });
    }
    
    next();
}

app.get('/api/admin/dashboard', verifyAdminSession, async (req, res) => {
    try {
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (usersError) throw usersError;
        
        const totalUsers = users ? users.length : 0;
        const activeUsers = users ? users.filter(u => u.is_active === true).length : 0;
        const inactiveUsers = totalUsers - activeUsers;
        
        let databaseSize = 'Calculating...';
        
        try {
            const { data: dbSizeData, error: dbError } = await supabase.rpc('get_database_size');
            
            if (dbSizeData && !dbError) {
                const sizeInMB = (dbSizeData / (1024 * 1024)).toFixed(2);
                databaseSize = `${sizeInMB} MB`;
            } else {
                const estimatedBytes = totalUsers * 2048;
                const sizeInKB = (estimatedBytes / 1024).toFixed(2);
                databaseSize = `${sizeInKB} KB (estimated)`;
            }
        } catch (error) {
            const estimatedBytes = totalUsers * 2048;
            const sizeInKB = (estimatedBytes / 1024).toFixed(2);
            databaseSize = `${sizeInKB} KB (estimated)`;
        }
        
        res.json({
            success: true,
            stats: {
                totalUsers: totalUsers,
                activeUsers: activeUsers,
                inactiveUsers: inactiveUsers,
                databaseSize: databaseSize,
                lastUpdated: new Date().toISOString()
            },
            users: users || []
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/delete-user/:userId', verifyAdminSession, async (req, res) => {
    const { userId } = req.params;
    
    try {
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('account_number, email, account_name')
            .eq('id', userId)
            .single();
        
        if (fetchError) throw fetchError;
        
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);
        
        if (deleteError) throw deleteError;
        
        console.log(`🗑️ Admin deleted user: ${user.account_name} (${user.email})`);
        
        res.json({ 
            success: true, 
            message: `User ${user.account_name} has been deleted successfully`,
            deletedUser: user
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/admin/delete-users', verifyAdminSession, async (req, res) => {
    const { userIds } = req.body;
    
    if (!userIds || userIds.length === 0) {
        return res.json({ success: false, message: 'No users selected' });
    }
    
    try {
        const { data: users, error: fetchError } = await supabase
            .from('users')
            .select('id, account_name, email')
            .in('id', userIds);
        
        if (fetchError) throw fetchError;
        
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .in('id', userIds);
        
        if (deleteError) throw deleteError;
        
        console.log(`🗑️ Admin deleted ${users.length} users`);
        
        res.json({ 
            success: true, 
            message: `${users.length} user(s) deleted successfully`,
            deletedCount: users.length
        });
    } catch (error) {
        console.error('Delete users error:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/admin/logout', verifyAdminSession, (req, res) => {
    const sessionToken = req.headers['x-admin-token'];
    activeSessions.delete(sessionToken);
    res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/admin/check-session', (req, res) => {
    const sessionToken = req.headers['x-admin-token'];
    const session = activeSessions.get(sessionToken);
    
    if (session && Date.now() < session.expiresAt) {
        res.json({ success: true, valid: true });
    } else {
        if (session) activeSessions.delete(sessionToken);
        res.json({ success: false, valid: false });
    }
});

// ============ CHECK EMAIL EXISTS ============
app.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { data } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        res.json({ exists: !!data });
    } catch (error) {
        res.json({ exists: false });
    }
});

// ============ CHECK ACCOUNT EXISTS ============
app.post('/api/check-account', async (req, res) => {
    const { account_number } = req.body;
    
    try {
        const { data } = await supabase
            .from('users')
            .select('account_number')
            .eq('account_number', account_number)
            .maybeSingle();
        
        res.json({ exists: !!data });
    } catch (error) {
        res.json({ exists: false });
    }
});

// ============ CREATE USER ============
app.post('/api/create-user', async (req, res) => {
    console.log('👤 Create user:', req.body.email);
    const { account_number, account_name, email, password_code } = req.body;
    
    const activationCode = Math.floor(10000 + Math.random() * 90000).toString();
    
    try {
        const { data: existingAccount } = await supabase
            .from('users')
            .select('account_number')
            .eq('account_number', account_number)
            .maybeSingle();
        
        if (existingAccount) {
            return res.json({ success: false, message: 'Account number already registered' });
        }
        
        const { data: existingEmail } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        if (existingEmail) {
            return res.json({ success: false, message: 'Email already registered' });
        }
        
        const { error } = await supabase
            .from('users')
            .insert({
                account_number,
                account_name,
                email,
                password_code,
                platform: 'opay',
                is_active: false,
                email_verified: false,
                activation_code: activationCode,
                activation_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
        
        if (error) throw error;
        
        console.log(`✅ User created: ${account_name} (${email}) - Activation: ${activationCode}`);
        
        res.json({ 
            success: true, 
            message: 'Account created! Payment required for activation.'
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.json({ success: false, message: error.message });
    }
});

// ============ LOGIN ============
app.post('/api/login', async (req, res) => {
    console.log('🔑 Login:', req.body.account_number);
    const { account_number, password_code } = req.body;
    
    try {
        const { data } = await supabase
            .from('users')
            .select('account_number, account_name, email, is_active')
            .eq('account_number', account_number)
            .eq('password_code', password_code)
            .maybeSingle();
        
        if (data) {
            res.json({ 
                success: true, 
                user: {
                    account_number: data.account_number,
                    account_name: data.account_name,
                    email: data.email
                }
            });
        } else {
            res.json({ success: false, message: 'Invalid account number or password' });
        }
    } catch (error) {
        res.json({ success: false, message: 'Database error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
