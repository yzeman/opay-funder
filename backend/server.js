const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ============ SUPABASE CONFIGURATION ============
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jdvfylqtdwnweodqmevv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use SERVICE ROLE key for backend!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============ PAYSTACK CONFIGURATION ============
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
    res.json({ message: 'OPay Backend API is running with Supabase!' });
});

// ============ RESOLVE ACCOUNT NAME (Paystack) ============
app.post('/api/resolve-account', async (req, res) => {
    const { account_number, bank_code } = req.body;
    
    console.log(`Resolving account: ${account_number}`);
    
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
        console.error('API Error:', error);
        res.json({ success: false, message: 'Network error' });
    }
});

// ============ CHECK EMAIL AVAILABILITY ============
app.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        if (error) throw error;
        
        res.json({ 
            available: !data,
            message: data ? 'Email already registered' : 'Email available'
        });
    } catch (error) {
        res.json({ available: true, message: 'Email available' });
    }
});

// ============ SEND ACTIVATION CODE ============
app.post('/api/send-activation', async (req, res) => {
    const { email, accountNumber, accountName } = req.body;
    
    // Generate 5-digit activation code
    const activationCode = Math.floor(10000 + Math.random() * 90000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes from now
    
    try {
        // Store activation code in database
        const { error } = await supabase
            .from('users')
            .update({
                activation_code: activationCode,
                activation_expires: expiresAt.toISOString()
            })
            .eq('email', email);
        
        // If email doesn't exist yet, we'll store during verification
        console.log(`📧 ACTIVATION CODE for ${email}: ${activationCode}`);
        
        res.json({ 
            success: true, 
            message: 'Activation code sent',
            code: activationCode // Remove in production
        });
    } catch (error) {
        res.json({ success: false, message: 'Failed to send code' });
    }
});

// ============ VERIFY CODE & CREATE USER ============
app.post('/api/verify-and-create', async (req, res) => {
    const { account_number, account_name, email, password_code, activation_code } = req.body;
    
    try {
        // Check if account number already exists
        const { data: existingAccount } = await supabase
            .from('users')
            .select('account_number')
            .eq('account_number', account_number)
            .maybeSingle();
        
        if (existingAccount) {
            return res.json({ success: false, message: 'Account number already registered' });
        }
        
        // Check if email already exists
        const { data: existingEmail } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        if (existingEmail) {
            return res.json({ success: false, message: 'Email already registered' });
        }
        
        // Verify activation code (for demo, accept any 5-digit code)
        // In production, verify against stored code
        if (!activation_code || activation_code.length !== 5) {
            return res.json({ success: false, message: 'Invalid activation code' });
        }
        
        // Create new user
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    account_number: account_number,
                    account_name: account_name,
                    email: email,
                    password_code: password_code,
                    platform: 'opay',
                    is_active: true,
                    email_verified: true,
                    created_at: new Date().toISOString()
                }
            ])
            .select();
        
        if (error) throw error;
        
        console.log('✅ User created:', data[0]);
        
        res.json({
            success: true,
            message: 'Account created successfully!',
            user: { account_number, account_name, email }
        });
        
    } catch (error) {
        console.error('Database error:', error);
        res.json({ success: false, message: error.message || 'Database error' });
    }
});

// ============ LOGIN ============
app.post('/api/login', async (req, res) => {
    const { account_number, password_code } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('account_number, account_name, email, is_active')
            .eq('account_number', account_number)
            .eq('password_code', password_code)
            .maybeSingle();
        
        if (error) throw error;
        
        if (data) {
            if (!data.is_active) {
                return res.json({ success: false, message: 'Account is deactivated' });
            }
            
            res.json({
                success: true,
                message: 'Login successful',
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

// ============ GET ALL USERS (ADMIN) ============
app.get('/api/admin/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, account_number, account_name, email, created_at, is_active')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json({ users: data });
    } catch (error) {
        res.json({ users: [] });
    }
});

// ============ GET PENDING ACTIVATIONS (ADMIN) ============
app.get('/api/admin/pending', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('email, activation_code, activation_expires')
            .not('activation_code', 'is', null);
        
        if (error) throw error;
        res.json({ pending: data });
    } catch (error) {
        res.json({ pending: [] });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ OPay Backend API running on port ${PORT}`);
    console.log(`✅ Supabase connected: ${SUPABASE_URL}`);
    console.log(`✅ Paystack key: ${PAYSTACK_SECRET_KEY ? 'Loaded' : 'Missing'}`);
});
