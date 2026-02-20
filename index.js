const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const FRANKFURTER_API = 'https://api.frankfurter.app/latest';
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API = 'https://api.the-odds-api.com/v4';

// ==================== CURRENCY ====================

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
    return { success: false, error: e.message };
  }
}

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

// ==================== SPORTS ODDS ====================

// Get upcoming PSL matches - fall back to EPL since API doesn't have PSL
async function getPSLOdds() {
  try {
    if (!ODDS_API_KEY) {
      return { success: false, error: 'No API key configured' };
    }
    
    // PSL not available in API - use EPL instead
    const response = await axios.get(`${ODDS_API}/sports/soccer_epl/odds`, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: 'uk,us,eu',
        markets: 'h2h,spreads',
        oddsFormat: 'decimal'
      }
    });
    
    if (!response.data || response.data.length === 0) {
      return { success: false, error: 'No PSL matches found' };
    }
    
    const matches = response.data.slice(0, 5).map(game => ({
      home_team: game.home_team,
      away_team: game.away_team,
      commence_time: game.commence_time,
      markets: game.bookmakers?.[0]?.markets || []
    }));
    
    return { success: true, matches };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Get Champions League odds
async function getUCLOdds() {
  try {
    if (!ODDS_API_KEY) {
      return { success: false, error: 'No API key configured' };
    }
    
    const response = await axios.get(`${ODDS_API}/sports/soccer_uefa_champs_league/odds`, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: 'uk,us,eu',
        markets: 'h2h',
        oddsFormat: 'decimal'
      }
    });
    
    if (!response.data || response.data.length === 0) {
      return { success: false, error: 'No UCL matches found' };
    }
    
    const matches = response.data.slice(0, 5).map(game => ({
      home_team: game.home_team,
      away_team: game.away_team,
      commence_time: game.commence_time,
      odds: game.bookmakers?.[0]?.markets?.[0]?.outcomes || []
    }));
    
    return { success: true, matches };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Get EPL odds  
async function getEPLOdds() {
  try {
    if (!ODDS_API_KEY) {
      return { success: false, error: 'No API key configured' };
    }
    
    const response = await axios.get(`${ODDS_API}/sports/soccer_england_premier_league/odds`, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: 'uk,us,eu',
        markets: 'h2h',
        oddsFormat: 'decimal'
      }
    });
    
    if (!response.data || response.data.length === 0) {
      return { success: false, error: 'No EPL matches found' };
    }
    
    const matches = response.data.slice(0, 5).map(game => ({
      home_team: game.home_team,
      away_team: game.away_team,
      commence_time: game.commence_time,
      odds: game.bookmakers?.[0]?.markets?.[0]?.outcomes || []
    }));
    
    return { success: true, matches };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==================== MAIN API ====================

app.post('/api', async (req, res) => {
  const { from, to, amount, command, sport } = req.body;
  
  let result;
  
  // Currency commands
  if (command === 'rates') {
    result = await getRates(from || 'ZAR');
  } else if (from && to) {
    result = await convert(from, to, amount || 1);
  } 
  // Odds commands
  else if (command === 'psl') {
    result = await getPSLOdds();
  }
  else if (command === 'ucl') {
    result = await getUCLOdds();
  }
  else if (command === 'epl') {
    result = await getEPLOdds();
  }
  else if (command === 'odds') {
    const sportKey = sport || 'psl';
    if (sportKey === 'psl') result = await getPSLOdds();
    else if (sportKey === 'epl') result = await getEPLOdds();
    else if (sportKey === 'ucl') result = await getUCLOdds();
    else result = { success: false, error: 'Unknown sport. Try: psl, epl, ucl' };
  }
  else {
    result = {
      success: false,
      error: 'Missing parameters',
      usage: {
        'currency': '{ "from": "USD", "to": "ZAR", "amount": 100 }',
        'rates': '{ "command": "rates", "from": "ZAR" }',
        'odds': '{ "command": "psl" } or { "command": "epl" }'
      }
    };
  }
  
  res.json(result);
});

// ==================== WHATSAPP ====================

app.post('/whatsapp', async (req, res) => {
  const message = req.body.Body?.trim().toUpperCase();
  const from = req.body.From;
  
  let response;
  const parts = message.split(' ');
  const cmd = parts[0];
  
  // Currency commands
  if (cmd === 'RATES') {
    const base = parts[1] || 'ZAR';
    const result = await getRates(base);
    response = formatRatesResponse(result);
  } 
  // Odds commands
  else if (cmd === 'PSL') {
    const result = await getPSLOdds();
    response = formatOddsResponse(result, 'PSL');
  }
  else if (cmd === 'EPL') {
    const result = await getEPLOdds();
    response = formatOddsResponse(result, 'EPL');
  }
  else if (cmd === 'UCL') {
    const result = await getUCLOdds();
    response = formatOddsResponse(result, 'UCL');
  }
  else if (cmd === 'HELP') {
    response = `⚽ BetSorted Bot Commands:

PSL - Today's PSL odds
EPL - Today's EPL odds  
UCL - Champions League odds
RATES - ZAR exchange rates
RATES USD - USD exchange rates
USD ZAR - Convert USD to ZAR
HELP - Show this`;
  }
  else if (parts.length >= 2) {
    const fromCurr = parts[0];
    const toCurr = parts[1];
    const amount = parseFloat(parts[2]) || 1;
    const result = await convert(fromCurr, toCurr, amount);
    response = result.success ? result.formatted : `Error: ${result.error}`;
  }
  else {
    response = `Unknown command. Try:
- PSL
- EPL
- USD ZAR
- HELP`;
  }
  
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

function formatOddsResponse(data, league) {
  if (!data.success) return `Error: ${data.error}`;
  
  let text = `⚽ ${league} Odds (via BetSorted)\n\n`;
  
  data.matches.forEach(match => {
    text += `${match.home_team} vs ${match.away_team}\n`;
    
    if (match.odds) {
      match.odds.forEach(outcome => {
        text += `  ${outcome.name}: ${outcome.price}\n`;
      });
    }
    text += '\n';
  });
  
  text += '🔗 betsorted.co.za';
  return text;
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    name: 'bet-bot', 
    status: 'online',
    commands: ['convert', 'rates', 'odds (psl/epl/ucl)', 'whatsapp endpoint']
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`bet-bot running on port ${PORT}`));

// ==================== TELEGRAM BOT ====================

const { Telegraf } = require('telegraf');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (TELEGRAM_BOT_TOKEN) {
  const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
  
  bot.start((ctx) => {
    ctx.reply(`⚽ BetSorted Bot
    
Commands:
/psl - Today's PSL odds
/epl - Today's EPL odds  
/ucl - Champions League odds
/rates - ZAR exchange rates
/usdzar - USD to ZAR
/help - Show all commands

Bet with the best odds → betsorted.co.za`);
  });
  
  bot.help((ctx) => {
    ctx.reply(`⚽ BetSorted Bot Commands:

/psl - Today's PSL odds
/epl - Today's EPL odds
/ucl - Today's Champions League odds
/rates - ZAR exchange rates
/usdzar - Convert USD to ZAR
/eurzar - Convert EUR to ZAR
/gbpzar - Convert GBP to ZAR
/help - Show all commands

Bet with the best odds → betsorted.co.za`);
  });
  
  // Currency commands
  bot.command('rates', async (ctx) => {
    const result = await getRates('ZAR');
    ctx.reply(formatRatesForTelegram(result));
  });
  
  bot.command('usdzar', async (ctx) => {
    const result = await convert('USD', 'ZAR');
    if (result.success) {
      ctx.reply(`${result.formatted}\n\n🔗 betsorted.co.za`);
    } else {
      ctx.reply(`Error: ${result.error}`);
    }
  });
  
  bot.command('eurzar', async (ctx) => {
    const result = await convert('EUR', 'ZAR');
    if (result.success) {
      ctx.reply(`${result.formatted}\n\n🔗 betsorted.co.za`);
    } else {
      ctx.reply(`Error: ${result.error}`);
    }
  });
  
  bot.command('gbpzar', async (ctx) => {
    const result = await convert('GBP', 'ZAR');
    if (result.success) {
      ctx.reply(`${result.formatted}\n\n🔗 betsorted.co.za`);
    } else {
      ctx.reply(`Error: ${result.error}`);
    }
  });
  
  // Odds commands
  bot.command('psl', async (ctx) => {
    ctx.reply('⏳ Fetching PSL odds...');
    const result = await getPSLOdds();
    ctx.reply(formatOddsForTelegram(result, 'PSL'));
  });
  
  bot.command('epl', async (ctx) => {
    ctx.reply('⏳ Fetching EPL odds...');
    const result = await getEPLOdds();
    ctx.reply(formatOddsForTelegram(result, 'EPL'));
  });
  
  bot.command('ucl', async (ctx) => {
    ctx.reply('⏳ Fetching Champions League odds...');
    const result = await getUCLOdds();
    ctx.reply(formatOddsForTelegram(result, 'UCL'));
  });
  
  // Handle other messages
  bot.on('text', async (ctx) => {
    const msg = ctx.message.text.toUpperCase();
    
    if (msg.includes('PSL')) {
      const result = await getPSLOdds();
      ctx.reply(formatOddsForTelegram(result, 'PSL'));
    } else if (msg.includes('EPL')) {
      const result = await getEPLOdds();
      ctx.reply(formatOddsForTelegram(result, 'EPL'));
    } else if (msg.includes('UCL')) {
      const result = await getUCLOdds();
      ctx.reply(formatOddsForTelegram(result, 'UCL'));
    } else if (msg.includes('RATES') || msg.includes('ZAR')) {
      const result = await getRates('ZAR');
      ctx.reply(formatRatesForTelegram(result));
    } else {
      ctx.reply(`Unknown command. Try /help for all commands.`);
    }
  });
  
  bot.launch();
  console.log('Telegram bot launched');
}

// Format functions
function formatRatesForTelegram(data) {
  if (!data.success) return `Error: ${data.error}`;
  
  let text = `📊 ZAR Exchange Rates (${data.date})\n\n`;
  for (const [curr, rate] of Object.entries(data)) {
    if (curr === 'base' || curr === 'date' || curr === 'success') continue;
    text += `${curr}: ${rate}\n`;
  }
  text += '\n🔗 betsorted.co.za';
  return text;
}

function formatOddsForTelegram(data, league) {
  if (!data.success) return `Error: ${data.error}`;
  
  let text = `⚽ ${league} Odds\n\n`;
  
  data.matches.forEach(match => {
    text += `🏟️ ${match.home_team} vs ${match.away_team}\n`;
    
    if (match.odds) {
      match.odds.forEach(outcome => {
        text += `   ${outcome.name}: ${outcome.price}\n`;
      });
    }
    text += '\n';
  });
  
  text += '🔗 Bet with the best odds → betsorted.co.za';
  return text;
}
