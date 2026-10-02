require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.EXCHANGE_RATE_API_KEY || '').trim();

// ------------------------------------------------------------------
// To add a new currency, just add one line here. The frontend
// dropdowns are built from this list automatically.
// ------------------------------------------------------------------
const CURRENCIES = [
  { code: 'USD', name: 'United States Dollar', flag: '🇺🇸' },
  { code: 'INR', name: 'Indian Rupee',         flag: '🇮🇳' },
  { code: 'EUR', name: 'Euro',                 flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',        flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen',         flag: '🇯🇵' },
  { code: 'AUD', name: 'Australian Dollar',    flag: '🇦🇺' },
  { code: 'CAD', name: 'Canadian Dollar',      flag: '🇨🇦' },
  { code: 'CHF', name: 'Swiss Franc',          flag: '🇨🇭' },
  { code: 'CNY', name: 'Chinese Yuan',         flag: '🇨🇳' },
  { code: 'SGD', name: 'Singapore Dollar',     flag: '🇸🇬' },
  { code: 'AED', name: 'UAE Dirham',           flag: '🇦🇪' }
];
const CODES = CURRENCIES.map((c) => c.code);

app.use(express.static(path.join(__dirname, 'public')));

// Fetch all rates for a base currency from the exchange-rate API.
async function getRates(base) {
  const url = API_KEY
    ? `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${base}`
    : `https://open.er-api.com/v6/latest/${base}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.result !== 'success') {
    const reason = data['error-type'] || `HTTP ${response.status}`;
    throw new Error(`Exchange-rate API error: ${reason}`);
  }

  return {
    rates: data.rates || data.conversion_rates,
    updated: data.time_last_update_utc
  };
}

// List of supported currencies (used to build the dropdowns)
app.get('/api/currencies', (req, res) => {
  res.json({ success: true, currencies: CURRENCIES });
});

// GET /api/convert?from=USD&to=INR&amount=100
app.get('/api/convert', async (req, res) => {
  const from = String(req.query.from || '').toUpperCase();
  const to = String(req.query.to || '').toUpperCase();
  const rawAmount = String(req.query.amount ?? '').trim();

  if (!from || !to) {
    return res.status(400).json({ success: false, error: 'Please select both source and target currencies.' });
  }
  if (!CODES.includes(from) || !CODES.includes(to)) {
    return res.status(400).json({ success: false, error: 'Unsupported currency selected.' });
  }
  if (rawAmount === '') {
    return res.status(400).json({ success: false, error: 'Amount cannot be empty.' });
  }
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    return res.status(400).json({ success: false, error: 'Amount must be a valid number.' });
  }
  if (amount <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be greater than 0.' });
  }

  try {
    const { rates, updated } = await getRates(from);
    const rate = rates[to];
    if (typeof rate !== 'number') {
      return res.status(502).json({ success: false, error: `No exchange rate available for ${from} → ${to}.` });
    }

    res.json({
      success: true,
      from,
      to,
      amount,
      rate,
      convertedAmount: Math.round(amount * rate * 100) / 100,
      updated
    });
  } catch (err) {
    console.error(err.message);
    res.status(502).json({
      success: false,
      error: 'Could not fetch exchange rates right now. Please try again later.'
    });
  }
});

// Popular rates (base USD) for the "Popular Rates" link
app.get('/api/popular', async (req, res) => {
  try {
    const { rates, updated } = await getRates('USD');
    const list = CODES.filter((c) => c !== 'USD').map((code) => ({ code, rate: rates[code] }));
    res.json({ success: true, base: 'USD', rates: list, updated });
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ success: false, error: 'Could not load popular rates.' });
  }
});

// API status for the "API Status" link
app.get('/api/health', async (req, res) => {
  try {
    const { updated } = await getRates('USD');
    res.json({ success: true, status: 'online', updated });
  } catch (err) {
    res.status(502).json({ success: false, status: 'offline', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Currency Converter running at http://localhost:${PORT}`);
  console.log(API_KEY ? 'Using ExchangeRate-API with your API key.' : 'No API key set: using the free keyless ExchangeRate-API endpoint.');
});