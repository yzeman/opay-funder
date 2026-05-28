const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Test endpoint
app.get('/', (req, res) => {
    res.json({ message: 'OPay Backend API is running!' });
});

// Account resolution endpoint
app.post('/api/resolve-account', async (req, res) => {
    const { account_number, bank_code } = req.body;
    
    console.log(`Resolving account: ${account_number}, bank: ${bank_code}`);
    
    // Bank codes mapping
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ OPay Backend API running on port ${PORT}`);
});
