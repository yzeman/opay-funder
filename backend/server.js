const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();

// CORS - Allow all
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const ADMIN_PASSWORD = 'adminkeyzer';

console.log('=== SERVER CONFIGURATION ===');
console.log('Paystack Secret Key:', PAYSTACK_SECRET_KEY ? 'SET' : 'MISSING');
console.log('Supabase URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
console.log('=============================');

const activeSessions = new Map();

// ============ BASIC ROUTES ============
app.get('/', (req, res) => {
    res.json({ 
        message: 'OPay Backend API is running!',
        status: 'ok',
        paystackConfigured: !!PAYSTACK_SECRET_KEY
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        paystackConfigured: !!PAYSTACK_SECRET_KEY
    });
});

// Test endpoint
app.get('/api/test-payment', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Test endpoint works!',
        paystackKeyExists: !!PAYSTACK_SECRET_KEY
    });
});

// ============ PAYMENT ENDPOINT (CRITICAL FIX) ============
app.post('/api/initialize-payment', async (req, res) => {
    console.log('=== PAYMENT ENDPOINT HIT ===');
    console.log('Request body:', req.body);
    
    const { email, amount, plan, tier } = req.body;
    
    // Validate
    if (!PAYSTACK_SECRET_KEY) {
        console.error('Paystack key missing');
        return res.status(500).json({ 
            success: false, 
            message: 'Payment system not configured' 
        });
    }
    
    if (!email) {
        console.error('Email missing');
        return res.status(400).json({ 
            success: false, 
            message: 'Email is required' 
        });
    }
    
    if (!amount || amount <= 0) {
        console.error('Invalid amount:', amount);
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid amount' 
        });
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
                amount: Math.round(amount * 100),
                currency: 'NGN',
                metadata: { plan, tier, email },
                callback_url: 'https://opay-funder.onrender.com/dashboard.html'
            })
        });
        
        const data = await response.json();
        console.log('Paystack response status:', data.status);
        
        if (data.status && data.data && data.data.authorization_url) {
            console.log('✅ Payment URL created');
            res.json({
                success: true,
                authorization_url: data.data.authorization_url,
                reference: data.data.reference
            });
        } else {
            console.error('Paystack error:', data.message);
            res.status(400).json({ 
                success: false, 
                message: data.message || 'Payment initialization failed' 
            });
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============ VERIFY PAYMENT ============
app.post('/api/verify-payment', async (req, res) => {
    const { reference, email } = req.body;
    
    console.log('Verifying payment:', reference);
    
    try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.status && data.data.status === 'success') {
            const tier = data.data.metadata.tier;
            const plan = data.data.metadata.plan;
            
            console.log(`✅ Payment verified! Tier: ${tier}`);
            
            res.json({
                success: true,
                message: `Successfully upgraded to ${plan} plan!`,
                tier: tier
            });
        } else {
            console.log('Verification failed:', data.message);
            res.json({ success: false, message: 'Payment verification failed' });
        }
    } catch (error) {
        console.error('Verify error:', error);
        res.json({ success: false, message: error.message });
    }
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

// ============ RESOLVE ACCOUNT NAME ============
app.post('/api/resolve-account', async (req, res) => {
    console.log('Resolve account:', req.body.account_number);
    const { account_number, bank_code } = req.body;
    
    let bankCode = bank_code === 'opay' ? '999992' : (bank_code || '999992');
    
    try {
        const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bankCode}`, {
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
            res.json({ success: false, message: data.message || 'Account not found' });
        }
    } catch (error) {
        res.json({ success: false, message: 'Network error' });
    }
});

// ============ BANK CODES ============
const BANK_CODES = {
    'OPay': '999992',
    'Moniepoint': '999991',
    'PalmPay': '999993',
    'Access Bank': '044',
    'GTBank': '058',
    'First Bank': '011',
    'UBA': '033',
    'Zenith Bank': '057'
};

app.post('/api/get-bank-code', async (req, res) => {
    const { bank_name } = req.body;
    const bankCode = BANK_CODES[bank_name] || null;
    
    if (bankCode) {
        res.json({ success: true, bank_code: bankCode });
    } else {
        res.json({ success: false, message: 'Bank not found' });
    }
});

app.get('/api/banks', async (req, res) => {
    const banks = Object.entries(BANK_CODES).map(([name, code]) => ({
        code: code,
        name: name,
        type: 'bank'
    }));
    res.json({ success: true, banks: banks });
});

// ============ CHECK EMAIL ============
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

// ============ CHECK ACCOUNT ============
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
    console.log('Create user:', req.body.email);
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
        
        res.json({ 
            success: true, 
            message: 'Account created! Payment required for activation.'
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ LOGIN ============
app.post('/api/login', async (req, res) => {
    console.log('Login:', req.body.account_number);
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

// ============ ADMIN ============
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
    
    if (!session || Date.now() > session.expiresAt) {
        if (session) activeSessions.delete(sessionToken);
        return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }
    
    next();
}

app.get('/api/admin/dashboard', verifyAdminSession, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json({
            success: true,
            stats: {
                totalUsers: users ? users.length : 0,
                activeUsers: users ? users.filter(u => u.is_active === true).length : 0,
                lastUpdated: new Date().toISOString()
            },
            users: users || []
        });
    } catch (error) {
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
        
        res.json({ 
            success: true, 
            message: `User ${user.account_name} has been deleted successfully`
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
        
        if (error) throw error;
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`✅ Test endpoint: https://opay-backend-api-pncl.onrender.com/api/test-payment`);
    console.log(`✅ Paystack configured: ${PAYSTACK_SECRET_KEY ? 'YES' : 'NO'}\n`);
});
