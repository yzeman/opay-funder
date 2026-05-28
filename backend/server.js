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

// ============ ADMIN LOGIN ============
app.post('/api/admin/login', async (req, res) => {
    const { password, sessionId } = req.body;
    
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

// ============ VERIFY ADMIN SESSION ============
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

// ============ ADMIN DASHBOARD DATA ============
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
        
        // Get database size
        let databaseSize = 'Calculating...';
        let databaseSizeBytes = 0;
        
        try {
            const { data: dbSizeData, error: dbError } = await supabase
                .rpc('get_database_size');
            
            if (dbSizeData && !dbError) {
                databaseSizeBytes = dbSizeData;
                const sizeInMB = (dbSizeData / (1024 * 1024)).toFixed(2);
                databaseSize = `${sizeInMB} MB`;
            } else {
                // Fallback calculation based on user count
                const estimatedBytes = totalUsers * 2048; // ~2KB per user
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
                databaseSizeBytes: databaseSizeBytes,
                lastUpdated: new Date().toISOString()
            },
            users: users || []
        });
        
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.json({ success: false, message: error.message });
    }
});

// ============ DELETE USER (ADMIN ONLY) ============
app.delete('/api/admin/delete-user/:userId', verifyAdminSession, async (req, res) => {
    const { userId } = req.params;
    
    try {
        // First, get user info for logging
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('account_number, email, account_name')
            .eq('id', userId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Delete the user
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

// ============ DELETE MULTIPLE USERS (ADMIN ONLY) ============
app.post('/api/admin/delete-users', verifyAdminSession, async (req, res) => {
    const { userIds } = req.body;
    
    if (!userIds || userIds.length === 0) {
        return res.json({ success: false, message: 'No users selected' });
    }
    
    try {
        // Get user info for logging
        const { data: users, error: fetchError } = await supabase
            .from('users')
            .select('id, account_name, email')
            .in('id', userIds);
        
        if (fetchError) throw fetchError;
        
        // Delete all selected users
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

// ============ ADMIN LOGOUT ============
app.post('/api/admin/logout', verifyAdminSession, (req, res) => {
    const sessionToken = req.headers['x-admin-token'];
    activeSessions.delete(sessionToken);
    res.json({ success: true, message: 'Logged out successfully' });
});

// ============ CHECK SESSION ============
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
