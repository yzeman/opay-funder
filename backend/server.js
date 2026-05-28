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

// ============ RESOLVE ACCOUNT NAME (Paystack) ============
app.post('/api/resolve-account', async (req, res) => {
    console.log('📞 Resolve account:', req.body.account_number);
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

// ============ CHECK EMAIL EXISTS ============
app.post('/api/check-email', async (req, res) => {
    console.log('📧 Check email:', req.body.email);
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
    console.log('🔢 Check account:', req.body.account_number);
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
    
    // Generate activation code
    const activationCode = Math.floor(10000 + Math.random() * 90000).toString();
    
    try {
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
                email_verified: false,
                activation_code: activationCode,
                activation_expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            });
        
        if (error) throw error;
        
        console.log(`✅ User created: ${account_name} (${email})`);
        console.log(`📧 Activation code: ${activationCode}`);
        
        res.json({ 
            success: true, 
            message: 'Account created successfully!',
            activation_code: activationCode
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
            .select('account_number, account_name, email, activation_code, email_verified')
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
                },
                needs_activation: !data.email_verified,
                activation_code: data.activation_code
            });
        } else {
            res.json({ success: false, message: 'Invalid account number or password' });
        }
    } catch (error) {
        res.json({ success: false, message: 'Database error' });
    }
});

// ============ ACTIVATE ACCOUNT ============
app.post('/api/activate', async (req, res) => {
    console.log('🔐 Activate account:', req.body.email);
    const { email, activation_code } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .update({ email_verified: true, activation_code: null })
            .eq('email', email)
            .eq('activation_code', activation_code)
            .select();
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            res.json({ success: true, message: 'Account activated successfully!' });
        } else {
            res.json({ success: false, message: 'Invalid activation code' });
        }
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ============ ADMIN - GET ALL USERS ============
app.get('/api/admin/users', async (req, res) => {
    const { data } = await supabase
        .from('users')
        .select('id, account_number, account_name, email, created_at, email_verified');
    
    res.json({ users: data || [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
