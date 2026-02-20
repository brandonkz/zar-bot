const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const FRANKFURTER_API = 'https://api.frankfurter.app/latest';

// Convert currency
async function convert(from, to, amount = 1) {
  try {
    const response = await axios.get(`${FRANKFURTER_API}?from=${from}&to=${to}`);
    const rate = response.data.rates[to];
    const result = rate * amount;
    
    return {
      success: true,
      from: from,
      to: to,
      amount: amount,
      rate: rate,
      result: result.toFixed(2),
      formatted: `${amount} ${from} = ${result.toFixed(2)} ${to}`,
      date: response.data.date
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      hint: 'Try: USD ZAR or EUR GBP'
    };
  }
}

// Get all rates
async function getRates(base = 'ZAR') {
  try {
    const response = await axios.get(`${FRANKFURTER_API}?from=${base}`);
    const rates = response.data.rates;
    
    const important = ['USD', 'EUR', 'GBP', 'AUD', 'BWP', 'NAD', 'ZMW'];
    const output = { base: base, date: response.data.date };
    
    important.forEach(c => {
      if (rates[c]) output[c] = parseFloat(rates[c].toFixed(4));
    });
    
    return { success: true, ...output };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// API endpoint
app.post('/api', async (req, res) => {
  const { from, to, amount, command } = req.body;
  
  let result;
  
  // Handle different commands
  if (command === 'rates' || command === 'help') {
    result = await getRates(from || 'ZAR');
  } else if (from && to) {
    result = await convert(from, to, amount || 1);
  } else {
    result = {
      success: false,
      error: 'Missing parameters',
      usage: {
        'convert': '{ "from": "USD", "to": "ZAR", "amount": 100 }',
        'rates': '{ "command": "rates", "from": "ZAR" }'
      }
    };
  }
  
  res.json(result);
});

// WhatsApp webhook (Twilio format)
app.post('/whatsapp', async (req, res) => {
  const message = req.body.Body?.trim().toUpperCase();
  const from = req.body.From;
  
  let response;
  
  // Parse message
  const parts = message.split(' ');
  
  if (parts[0] === 'RATES') {
    const base = parts[1] || 'ZAR';
    const result = await getRates(base);
    response = formatRatesResponse(result);
  } else if (parts.length >= 2) {
    const fromCurr = parts[0];
    const toCurr = parts[1];
    const amount = parseFloat(parts[2]) || 1;
    const result = await convert(fromCurr, toCurr, amount);
    response = result.success ? result.formatted : `Error: ${result.error}`;
  } else if (parts[0] === 'HELP') {
    response = `zar-bot Commands:

RATES - Get ZAR rates
RATES USD - Get USD rates
USD ZAR - Convert USD to ZAR
USD ZAR 100 - Convert 100 USD to ZAR
EUR GBP - Convert EUR to GBP
HELP - Show this`;
  } else {
    response = `Unknown command. Try:
- USD ZAR
- RATES
- HELP`;
  }
  
  // TwiML response
  res.type('text/xml').send(`
    <Response>
      <Message>${response}</Message>
    </Response>
  `);
});

function formatRatesResponse(data) {
  if (!data.success) return `Error: ${data.error}`;
  
  let text = `📊 ${data.base} Exchange Rates (${data.date})\n\n`;
  for (const [curr, rate] of Object.entries(data)) {
    if (curr === 'base' || curr === 'date' || curr === 'success') continue;
    text += `${curr}: ${rate}\n`;
  }
  return text;
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    name: 'zar-bot', 
    status: 'online',
    commands: ['convert', 'rates', 'whatsapp endpoint']
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`zar-bot running on port ${PORT}`));
