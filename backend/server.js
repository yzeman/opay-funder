const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jdvfylqtdwnweodqmevv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdmZ5bHF0ZHdud2VvZHFtZXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjYwNDUsImV4cCI6MjA5NTU0MjA0NX0.Ec1-oJpEaC9FoiVuZJh3GPN_PgRD38skuwHvMcWOpGU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Paystack Configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Generate random activation code
function generateActivationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
    res.json({ message: 'OPay Backend API is running!' });
});

// ============ RESOLVE ACCOUNT NAME (PAYSTACK) ============
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
        res.json({
            success: false,
            message: 'Network error. Please try again.'
        });
    }
});

// ============ CHECK IF EMAIL EXISTS ============
app.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        res.json({ exists: !!data });
    } catch (error) {
        res.json({ exists: false });
    }
});

// ============ CHECK IF ACCOUNT EXISTS ============
app.post('/api/check-account', async (req, res) => {
    const { account_number } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('account_number')
            .eq('account_number', account_number)
            .maybeSingle();
        
        res.json({ exists: !!data });
    } catch (error) {
        res.json({ exists: false });
    }
});

// ============ CREATE USER WITH ACTIVATION CODE ============
app.post('/api/create-user', async (req, res) => {
    const { account_number, account_name, email, password_code } = req.body;
    
    try {
        // Check if account number already exists
        const { data: existingAccount } = await supabase
            .from('users')
            .select('account_number')
            .eq('account_number', account_number)
            .maybeSingle();
        
        if (existingAccount) {
            return res.json({ success: false, message: 'This account number is already registered. Please use a different account number or contact support.' });
        }
        
        // Check if email already exists
        const { data: existingEmail } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        if (existingEmail) {
            return res.json({ success: false, message: 'This email is already registered. Each email can only be used for one account.' });
        }
        
        // Generate activation code
        const activationCode = generateActivationCode();
        
        // Insert user (inactive until activation)
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([
                { 
                    account_number: account_number,
                    account_name: account_name,
                    email: email,
                    password_code: password_code,
                    is_active: false
                }
            ])
            .select()
            .single();
        
        if (userError) throw userError;
        
        // Save activation code
        const { error: codeError } = await supabase
            .from('activation_codes')
            .insert([
                {
                    email: email,
                    activation_code: activationCode,
                    account_number: account_number,
                    is_used: false
                }
            ]);
        
        if (codeError) throw codeError;
        
        res.json({ 
            success: true, 
            message: 'Account created! An activation code has been generated.',
            activation_code: activationCode,
            user: userData
        });
        
    } catch (error) {
        console.error('Supabase error:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Database error' 
        });
    }
});

// ============ LOGIN USER ============
app.post('/api/login', async (req, res) => {
    const { account_number, password_code } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('account_number', account_number)
            .eq('password_code', password_code)
            .single();
        
        if (data) {
            res.json({ 
                success: true, 
                user: data,
                message: 'Login successful!'
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Invalid account number or password. Please check your credentials and try again.'
            });
        }
    } catch (error) {
        res.json({ success: false, message: 'Login failed. Please try again.' });
    }
});

// ============ GET USER BY ACCOUNT NUMBER ============
app.post('/api/get-user', async (req, res) => {
    const { account_number } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('account_number', account_number)
            .single();
        
        if (data) {
            res.json({ success: true, user: data });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        res.json({ success: false, message: 'User not found' });
    }
});

// ============ ADMIN: GET ALL ACTIVATION CODES ============
app.post('/api/admin/activation-codes', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Verify admin credentials
        const { data: admin } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();
        
        if (!admin) {
            return res.json({ success: false, message: 'Invalid admin credentials' });
        }
        
        // Get all activation codes
        const { data, error } = await supabase
            .from('activation_codes')
            .select('*')
            .order('created_at', { ascending: false });
        
        res.json({ success: true, codes: data });
    } catch (error) {
        res.json({ success: false, message: 'Error fetching activation codes' });
    }
});

// ============ ADMIN: GET ALL USERS ============
app.post('/api/admin/users', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const { data: admin } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();
        
        if (!admin) {
            return res.json({ success: false, message: 'Invalid admin credentials' });
        }
        
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        res.json({ success: true, users: data });
    } catch (error) {
        res.json({ success: false, message: 'Error fetching users' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ OPay Backend API running on port ${PORT}`);
});
