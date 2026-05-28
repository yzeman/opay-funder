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
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdmZ5bHF0ZHdud2VvZHFtZXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjYwNDUsImV4cCI6MjA5NTU0MjA0NX0.Ec1-oJpEaC9FoiVuZJh3GPN_PgRD38skuwHvMcWOpGU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ PAYSTACK CONFIGURATION ============
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
    res.json({ message: 'OPay Backend API is running!' });
});

// ============ RESOLVE ACCOUNT NAME ============
app.post('/api/resolve-account', async (req, res) => {
    const { account_number, bank_code } = req.body;
    
    console.log(`Resolving account: ${account_number}, bank: ${bank_code}`);
    
    const bankCodes = {
        'opay': '999992',
        'gtb': '058',
        'first': '011',
        'uba': '033',
        'zenith': '057',
        'access': '044'
    };
    
    const bankCode = bankCodes[bank_code] || bank_code;
    
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

// ============ CREATE USER (SAVE TO SUPABASE) ============
app.post('/api/create-user', async (req, res) => {
    const { account_number, account_name, email, password_code } = req.body;
    
    try {
        // Check if user already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('account_number, email')
            .or(`account_number.eq.${account_number},email.eq.${email}`)
            .maybeSingle();
        
        if (existingUser) {
            if (existingUser.account_number === account_number) {
                return res.json({ success: false, message: 'Account number already registered' });
            }
            if (existingUser.email === email) {
                return res.json({ success: false, message: 'Email already registered' });
            }
        }
        
        // Insert new user
        const { data, error } = await supabase
            .from('users')
            .insert([
                { 
                    account_number: account_number,
                    account_name: account_name,
                    email: email,
                    password_code: password_code,
                    platform: 'opay',
                    created_at: new Date()
                }
            ])
            .select();
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            message: 'Account created successfully!',
            user: data[0]
        });
        
    } catch (error) {
        console.error('Supabase error:', error);
        res.json({ 
            success: false, 
            message: error.message || 'Database error' 
        });
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
        
        if (error) throw error;
        
        res.json({ success: true, user: data });
    } catch (error) {
        res.json({ success: false, message: 'User not found' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ OPay Backend API running on port ${PORT}`);
    console.log(`✅ Supabase connected: ${SUPABASE_URL}`);
    console.log(`✅ Paystack key loaded: ${PAYSTACK_SECRET_KEY ? 'Yes' : 'No'}`);
});
