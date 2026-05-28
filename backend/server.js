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

// ============ CREATE USER (NO ACTIVATION CODE SHOWN) ============
app.post('/api/create-user', async (req, res) => {
    console.log('👤 Create user:', req.body.email);
    const { account_number, account_name, email, password_code } = req.body;
    
    // Generate activation code (store in database, NOT shown to user)
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
        
        // Create user with activation code (NOT returned to user)
        const { error } = await supabase
            .from('users')
            .insert({
                account_number,
                account_name,
                email,
                password_code,
                platform: 'opay',
                is_active: false,  // Account is NOT active until payment
                email_verified: false,
                activation_code: activationCode,
                activation_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
            });
        
        if (error) throw error;
        
        // Store activation code for admin/payment retrieval
        console.log(`✅ User created: ${account_name} (${email})`);
        console.log(`🔐 Activation code stored: ${activationCode} (NOT shown to user)`);
        
        // DO NOT return activation code to user!
        res.json({ 
            success: true, 
            message: 'Account created! Please contact admin or make payment to activate your account.',
            // NO activation_code field here!
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.json({ success: false, message: error.message });
    }
});

// ============ GET ACTIVATION CODE (FOR ADMIN/PAYMENT) ============
app.post('/api/get-activation-code', async (req, res) => {
    const { email, admin_key } = req.body;
    
    // Only allow with admin key or after payment verification
    const ADMIN_KEY = process.env.ADMIN_KEY || 'OPAY_ADMIN_2025';
    
    if (admin_key !== ADMIN_KEY) {
        return res.json({ success: false, message: 'Unauthorized. Admin key required.' });
    }
    
    try {
        const { data } = await supabase
            .from('users')
            .select('activation_code, account_number, account_name')
            .eq('email', email)
            .maybeSingle();
        
        if (data && data.activation_code) {
            res.json({ 
                success: true, 
                activation_code: data.activation_code,
                account_number: data.account_number,
                account_name: data.account_name
            });
        } else {
            res.json({ success: false, message: 'No activation code found for this email' });
        }
    } catch (error) {
        res.json({ success: false, message: 'Error retrieving activation code' });
    }
});

// ============ ACTIVATE ACCOUNT (AFTER PAYMENT) ============
app.post('/api/activate-account', async (req, res) => {
    const { email, activation_code, payment_verified } = req.body;
    
    // Require payment verification
    if (!payment_verified) {
        return res.json({ success: false, message: 'Payment verification required. Please complete payment first.' });
    }
    
    try {
        const { data, error } = await supabase
            .from('users')
            .update({ 
                is_active: true, 
                email_verified: true,
                activated_at: new Date().toISOString()
            })
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

// ============ LOGIN (CHECK IF ACTIVE) ============
app.post('/api/login', async (req, res) => {
    console.log('🔑 Login:', req.body.account_number);
    const { account_number, password_code } = req.body;
    
    try {
        const { data } = await supabase
            .from('users')
            .select('account_number, account_name, email, is_active, email_verified')
            .eq('account_number', account_number)
            .eq('password_code', password_code)
            .maybeSingle();
        
        if (data) {
            if (!data.is_active) {
                return res.json({ 
                    success: false, 
                    message: 'Account not activated. Please complete payment to activate your account.',
                    needs_activation: true
                });
            }
            
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

// ============ ADMIN - GET ALL PENDING ACTIVATIONS ============
app.get('/api/admin/pending', async (req, res) => {
    const { data } = await supabase
        .from('users')
        .select('id, account_number, account_name, email, activation_code, created_at')
        .eq('is_active', false);
    
    res.json({ pending: data || [] });
});

// ============ ADMIN - GET ALL USERS ============
app.get('/api/admin/users', async (req, res) => {
    const { data } = await supabase
        .from('users')
        .select('id, account_number, account_name, email, created_at, is_active, email_verified');
    
    res.json({ users: data || [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
