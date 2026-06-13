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
const FRONTEND_URL = 'https://opay-funder.onrender.com';

const activeSessions = new Map();

console.log('✅ Server starting...');
console.log('🔐 Paystack Mode:', PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST');
console.log('🌐 Frontend URL:', FRONTEND_URL);

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
    res.json({ 
        message: 'OPay Backend API is running!',
        status: 'ok',
        paystack_mode: PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test'
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
            .select('account_number, account_name, email, nickname, gender, date_of_birth, address, profile_picture, phone_number, user_tier')
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

// ============ RESOLVE ACCOUNT NAME ============
app.post('/api/resolve-account', async (req, res) => {
    console.log('📞 Resolve account:', req.body.account_number, 'Bank Code:', req.body.bank_code);
    const { account_number, bank_code } = req.body;
    
    let bankCode;
    
    if (bank_code === 'opay' || bank_code === 'OPay' || bank_code === 'OPay Digital Bank') {
        bankCode = '999992';
    } else if (bank_code === 'moniepoint') {
        bankCode = '999991';
    } else if (bank_code === 'palmpay') {
        bankCode = '999993';
    } else if (bank_code === 'paga') {
        bankCode = '999994';
    } else if (bank_code === 'kuda') {
        bankCode = '999995';
    } else if (bank_code) {
        bankCode = bank_code;
    } else {
        bankCode = '999992';
    }
    
    console.log('Using bank code:', bankCode);
    
    try {
        const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bankCode}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('Paystack response:', data.status ? 'Success' : 'Failed - ' + data.message);
        
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

// ============ BANK CODES MAPPING ============
const BANK_CODES = {
    'OPay': '999992',
    'Moniepoint': '999991',
    'PalmPay': '999993',
    'Paga': '999994',
    'Kuda Bank': '999995',
    'Carbon': '999996',
    'V Bank': '999997',
    'Sparkle': '999998',
    'FairMoney': '999999',
    'Renmoney': '999990',
    'Access Bank': '044',
    'Citibank': '023',
    'Ecobank': '050',
    'Fidelity Bank': '070',
    'First Bank': '011',
    'FCMB': '214',
    'GTBank': '058',
    'Heritage Bank': '030',
    'Jaiz Bank': '301',
    'Keystone Bank': '082',
    'Polaris Bank': '076',
    'Providus Bank': '101',
    'Stanbic IBTC': '068',
    'Standard Chartered': '090',
    'Sterling Bank': '232',
    'SunTrust Bank': '100',
    'Titan Trust Bank': '00102',
    'Union Bank': '032',
    'UBA': '033',
    'Unity Bank': '215',
    'Wema Bank': '035',
    'Zenith Bank': '057'
};

// ============ GET BANK CODE ============
app.post('/api/get-bank-code', async (req, res) => {
    const { bank_name } = req.body;
    
    const bankCode = BANK_CODES[bank_name] || null;
    
    if (bankCode) {
        res.json({ success: true, bank_code: bankCode });
    } else {
        res.json({ success: false, message: 'Bank not found' });
    }
});

// ============ DIGITAL WALLETS LIST ============
const DIGITAL_WALLETS = [
    { code: '999991', name: 'OPay', logo: 'images/opay.png' },
    { code: '999992', name: 'Moniepoint', logo: 'https://moniepoint.com/images/logo.svg' },
    { code: '999993', name: 'PalmPay', logo: 'https://palmpay.com/images/logo.png' },
    { code: '999994', name: 'Paga', logo: 'https://www.paga.com/images/logo.png' },
    { code: '999995', name: 'Kuda Bank', logo: 'https://kuda.com/logo.png' },
    { code: '999996', name: 'Carbon', logo: 'https://carbon.africa/logo.png' },
    { code: '999997', name: 'V Bank', logo: 'https://vbank.ng/logo.png' },
    { code: '999998', name: 'Sparkle', logo: 'https://sparkle.ng/logo.png' },
    { code: '999999', name: 'FairMoney', logo: 'https://fairmoney.ng/logo.png' }
];

// ============ GET ALL BANKS ============
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
            const traditionalBanks = data.data
                .filter(bank => bank.country === 'Nigeria')
                .map(bank => ({
                    code: bank.code,
                    name: bank.name,
                    type: 'traditional'
                }));
            
            const digitalWalletsFormatted = DIGITAL_WALLETS.map(wallet => ({
                code: wallet.code,
                name: wallet.name,
                type: 'digital'
            }));
            
            const allBanks = [...traditionalBanks, ...digitalWalletsFormatted];
            
            res.json({ success: true, banks: allBanks });
        } else {
            const digitalWalletsFormatted = DIGITAL_WALLETS.map(wallet => ({
                code: wallet.code,
                name: wallet.name,
                type: 'digital'
            }));
            res.json({ success: true, banks: digitalWalletsFormatted });
        }
    } catch (error) {
        const digitalWalletsFormatted = DIGITAL_WALLETS.map(wallet => ({
            code: wallet.code,
            name: wallet.name,
            type: 'digital'
        }));
        res.json({ success: true, banks: digitalWalletsFormatted });
    }
});

// ============ GET BANKS WITH LOGOS ============
app.get('/api/banks-with-logos', async (req, res) => {
    const digitalWalletsWithLogos = DIGITAL_WALLETS.map(wallet => ({
        code: wallet.code,
        name: wallet.name,
        logo: wallet.logo
    }));
    
    res.json({ success: true, banks: digitalWalletsWithLogos });
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

app.post('/api/admin/assign-tier', verifyAdminSession, async (req, res) => {
    const { email, tier } = req.body;
    
    try {
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                user_tier: tier,
                tier_updated_at: new Date().toISOString()
            })
            .eq('email', email);
        
        if (updateError) throw updateError;
        
        console.log(`👑 Admin assigned tier ${tier} to user ${email}`);
        
        res.json({ 
            success: true, 
            message: `Tier ${tier} assigned successfully` 
        });
    } catch (error) {
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
                is_active: true,
                email_verified: true,
                activation_code: activationCode,
                activation_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                user_tier: '1',
                account_balance: 70000.00
            });
        
        if (error) throw error;
        
        console.log(`✅ User created: ${account_name} (${email})`);
        
        res.json({ 
            success: true, 
            message: 'Account created successfully!'
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
        const { data, error } = await supabase
            .from('users')
            .select('account_number, account_name, email, is_active, user_tier')
            .eq('account_number', account_number)
            .eq('password_code', password_code)
            .maybeSingle();
        
        if (error) throw error;
        
        if (data) {
            await supabase
                .from('users')
                .update({ last_seen: new Date().toISOString() })
                .eq('account_number', account_number);
            
            res.json({ 
                success: true, 
                user: {
                    account_number: data.account_number,
                    account_name: data.account_name,
                    email: data.email,
                    tier: data.user_tier || '1'
                }
            });
        } else {
            res.json({ success: false, message: 'Invalid account number or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.json({ success: false, message: 'Database error' });
    }
});

// ============ PAYSTACK PAYMENT INITIALIZATION (LIVE MODE) ============
app.post('/api/initialize-payment', async (req, res) => {
    const { email, amount, plan, tier } = req.body;
    
    console.log('💰 Initializing payment:', { email, amount, plan, tier });
    console.log('🔐 Using Paystack Key:', PAYSTACK_SECRET_KEY ? `${PAYSTACK_SECRET_KEY.substring(0, 10)}...` : 'MISSING');
    
    if (!PAYSTACK_SECRET_KEY) {
        console.error('❌ PAYSTACK_SECRET_KEY is not set!');
        return res.json({ success: false, message: 'Payment gateway not configured' });
    }
    
    try {
        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                amount: amount * 100,
                currency: 'NGN',
                metadata: {
                    plan: plan,
                    tier: tier,
                    custom_fields: [
                        { display_name: "Plan", variable_name: "plan", value: plan },
                        { display_name: "Tier", variable_name: "tier", value: tier }
                    ]
                },
                callback_url: `${FRONTEND_URL}/payment-callback.html`
            })
        });
        
        const data = await response.json();
        console.log('Paystack response:', data.status ? 'Success' : 'Failed');
        
        if (data.status) {
            console.log('✅ Payment URL:', data.data.authorization_url);
            res.json({
                success: true,
                authorization_url: data.data.authorization_url,
                reference: data.data.reference
            });
        } else {
            console.error('❌ Paystack error:', data.message);
            res.json({ success: false, message: data.message });
        }
    } catch (error) {
        console.error('❌ Payment initialization error:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============ VERIFY PAYMENT & UPDATE TIER ============
app.post('/api/verify-payment', async (req, res) => {
    const { reference, email } = req.body;
    
    console.log('🔍 Verifying payment:', { reference, email });
    
    try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('Verification response:', data.status ? 'Success' : 'Failed');
        
        if (data.status && data.data.status === 'success') {
            const tier = data.data.metadata.tier;
            const plan = data.data.metadata.plan;
            const amount = data.data.amount / 100;
            
            console.log(`✅ Payment verified: ${email} paid ₦${amount} for ${plan} (Tier ${tier})`);
            
            const { error: updateError } = await supabase
                .from('users')
                .update({ 
                    user_tier: tier,
                    tier_updated_at: new Date().toISOString(),
                    is_active: true
                })
                .eq('email', email);
            
            if (updateError) {
                console.error('Failed to update tier:', updateError);
                return res.json({ success: false, message: 'Failed to update user tier' });
            }
            
            console.log(`✅ User ${email} upgraded to tier ${tier} (${plan})`);
            
            res.json({
                success: true,
                message: `Successfully upgraded to ${plan} plan!`,
                tier: tier,
                plan: plan,
                amount: amount
            });
        } else {
            console.error('Verification failed:', data.message);
            res.json({ success: false, message: data.message || 'Payment verification failed' });
        }
    } catch (error) {
        console.error('Verify payment error:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============ UPDATE LAST SEEN ============
app.post('/api/update-last-seen', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.json({ success: false, message: 'Email required' });
    }
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ last_seen: new Date().toISOString() })
            .eq('email', email);
        
        if (error) {
            console.error('Update error:', error);
            return res.json({ success: false, message: error.message });
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Update last seen error:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============ GET USERS WITH LAST SEEN (ADMIN) ============
app.get('/api/admin/users-with-lastseen', verifyAdminSession, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, account_number, account_name, email, password_code, is_active, created_at, last_seen, user_tier')
            .order('last_seen', { ascending: false, nullsLast: true });
        
        if (error) throw error;
        
        const formattedUsers = users.map(user => ({
            ...user,
            last_seen: user.last_seen || null,
            created_at: user.created_at
        }));
        
        res.json({ success: true, users: formattedUsers });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============ WEBHOOK FOR PAYSTACK (IMPORTANT FOR LIVE MODE) ============
app.post('/api/paystack-webhook', async (req, res) => {
    const event = req.body;
    
    console.log('📨 Webhook received:', event.event);
    
    if (event.event === 'charge.success') {
        const { reference, metadata, customer } = event.data;
        const email = customer.email;
        const tier = metadata.tier;
        const plan = metadata.plan;
        
        console.log(`💰 Charge success for ${email}: ${plan} plan`);
        
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                user_tier: tier,
                tier_updated_at: new Date().toISOString(),
                is_active: true
            })
            .eq('email', email);
        
        if (updateError) {
            console.error('Webhook update error:', updateError);
        } else {
            console.log(`✅ Webhook updated tier for ${email} to ${tier}`);
        }
    }
    
    res.sendStatus(200);
});

// ========== KUDA FUNDER BACKEND START ==========

// Verify activation code (hidden from frontend)
const KUDA_ACTIVATION_CODE = "ykkeduer2026";

// Resolve account name using Paystack
app.post('/api/kuda/resolve-account', async (req, res) => {
    const { account_number, bank_code } = req.body;
    
    console.log('🔍 Kuda resolve account:', account_number, 'Bank Code:', bank_code);
    
    // Map bank names to Paystack bank codes
    const bankCodeMap = {
        'Access Bank': '044',
        'Ecobank': '050',
        'First Bank': '011',
        'GT Bank': '058',
        'Keystone Bank': '082',
        'Kuda': '999992',
        'Moniepoint': '999991',
        'Opay': '999992',
        'Paga': '999994',
        'Palmpay': '999993',
        'Polaris Bank': '076',
        'Sterling Bank': '232',
        'UBA': '033',
        'Union Bank': '032',
        'Wema Bank': '035',
        'Zenith Bank': '057'
    };
    
    const paystackBankCode = bankCodeMap[bank_code] || bank_code;
    
    try {
        const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${paystackBankCode}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
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
        console.error('Resolve account error:', error);
        res.json({ success: false, message: 'Network error' });
    }
});

// Verify activation code (backend validation - hidden from user)
app.post('/api/kuda/verify-activation', async (req, res) => {
    const { activationCode, email } = req.body;
    
    console.log('🔐 Kuda activation attempt for:', email);
    
    if (activationCode === KUDA_ACTIVATION_CODE) {
        console.log('✅ Activation successful for:', email);
        res.json({
            success: true,
            message: 'Account activated successfully'
        });
    } else {
        console.log('❌ Activation failed for:', email);
        res.json({
            success: false,
            message: 'Invalid activation code'
        });
    }
});

// Process Kuda withdrawal/transfer (no Telegram)
app.post('/api/kuda/process-transfer', async (req, res) => {
    const { email, accountName, accountNumber, amount, bankName, reference } = req.body;
    
    console.log(`💸 Kuda transfer: ${email} sent ₦${amount} to ${accountName} (${accountNumber}) via ${bankName}`);
    
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleString('en-US', {
        timeZone: 'Africa/Lagos',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // NO TELEGRAM - Just log to console
    console.log(`✅ Transfer processed: Reference ${reference} on ${formattedDate}`);
    
    res.json({
        success: true,
        message: 'Transfer processed successfully',
        transaction: {
            reference,
            amount,
            date: formattedDate
        }
    });
});

// ========== KUDA FUNDER BACKEND END ==========

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        paystack_configured: !!PAYSTACK_SECRET_KEY
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📝 Paystack configured: ${PAYSTACK_SECRET_KEY ? 'Yes' : 'No'}`);
    console.log(`🔐 Paystack Mode: ${PAYSTACK_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST'}`);
    console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});
