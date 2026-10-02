const $ = (id) => document.getElementById(id);

const form = $('converterForm');
const amountInput = $('amount');
const amountError = $('amountError');
const amountSymbol = $('amountSymbol');
const fromSelect = $('fromCurrency');
const toSelect = $('toCurrency');
const swapBtn = $('swapBtn');
const convertBtn = $('convertBtn');
const convertBtnText = $('convertBtnText');
const spinner = $('spinner');
const alertBox = $('alertBox');
const resultSection = $('resultSection');
const loadingSection = $('loadingSection');

const infoModal = new bootstrap.Modal($('infoModal'));

const fmt = (n, max = 2) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: max }).format(n);

const fmtRate = (r) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: r < 1 ? 6 : 4 }).format(r);

// ---------- Helpers ----------
function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol'
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency').value;
  } catch {
    return code;
  }
}

function updateSymbol() {
  amountSymbol.textContent = currencySymbol(fromSelect.value);
}

function showFieldError(msg) {
  amountInput.classList.add('is-invalid');
  amountError.textContent = msg;
}

function clearErrors() {
  amountInput.classList.remove('is-invalid');
  amountError.textContent = '';
  alertBox.classList.add('d-none');
  alertBox.textContent = '';
}

function showAlert(msg) {
  alertBox.textContent = msg;
  alertBox.classList.remove('d-none');
}

function setLoading(isLoading) {
  convertBtn.disabled = isLoading;
  spinner.classList.toggle('d-none', !isLoading);
  convertBtnText.textContent = isLoading ? 'CONVERTING…' : 'CONVERT';
  loadingSection.classList.toggle('d-none', !isLoading);
  if (isLoading) resultSection.classList.add('d-none');
}

function formatUpdated(utcString) {
  const d = utcString ? new Date(utcString) : new Date();
  if (isNaN(d)) return '';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short'
  });
}

// ---------- Load currencies ----------
async function loadCurrencies() {
  try {
    const res = await fetch('/api/currencies');
    const data = await res.json();
    if (!data.success) throw new Error();

    const options = data.currencies
      .map((c) => `<option value="${c.code}">${c.flag} ${c.code} - ${c.name}</option>`)
      .join('');
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;
    fromSelect.value = 'USD';
    toSelect.value = 'INR';
    updateSymbol();
  } catch {
    showAlert('Could not load the currency list. Please refresh the page.');
  }
}

// ---------- Validation ----------
function validate() {
  clearErrors();
  const raw = amountInput.value.replace(/,/g, '').trim();

  if (!fromSelect.value || !toSelect.value) {
    showAlert('Please select both source and target currencies.');
    return null;
  }
  if (raw === '') {
    showFieldError('Amount cannot be empty.');
    return null;
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    showFieldError('Please enter a valid numerical amount.');
    return null;
  }
  if (amount <= 0) {
    showFieldError('Please enter a valid numerical amount greater than 0.');
    return null;
  }
  return amount;
}

// ---------- Convert ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = validate();
  if (amount === null) return;

  const from = fromSelect.value;
  const to = toSelect.value;
  setLoading(true);

  try {
    const params = new URLSearchParams({ from, to, amount });
    const res = await fetch(`/api/convert?${params}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Conversion failed. Please try again.');
    }

    $('resultFrom').textContent = `${fmt(data.amount, 6)} ${data.from} =`;
    $('resultMain').textContent = `${fmt(data.convertedAmount)} ${data.to}`;
    $('resultRate').textContent = `1 ${data.from} = ${fmtRate(data.rate)} ${data.to}`;
    $('resultUpdated').textContent = `Updated: ${formatUpdated(data.updated)}`;
    resultSection.classList.remove('d-none');
  } catch (err) {
    const msg = err instanceof TypeError ? 'Network error. Please check your connection and try again.' : err.message;
    showAlert(msg);
  } finally {
    setLoading(false);
  }
});

// ---------- Swap ----------
swapBtn.addEventListener('click', () => {
  [fromSelect.value, toSelect.value] = [toSelect.value, fromSelect.value];
  updateSymbol();
  resultSection.classList.add('d-none');
});

fromSelect.addEventListener('change', updateSymbol);
amountInput.addEventListener('input', () => {
  amountInput.classList.remove('is-invalid');
});

// ---------- Navbar: Popular Rates & API Status ----------
function openModal(title, bodyHtml) {
  $('infoModalTitle').textContent = title;
  $('infoModalBody').innerHTML = bodyHtml;
  infoModal.show();
}

$('popularLink').addEventListener('click', async (e) => {
  e.preventDefault();
  openModal('Popular Rates (1 USD)', '<p class="mb-0">Loading…</p>');
  try {
    const res = await fetch('/api/popular');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const rows = data.rates
      .map((r) => `<tr><td>${r.code}</td><td class="text-end">${fmtRate(r.rate)}</td></tr>`)
      .join('');
    openModal(
      'Popular Rates (1 USD)',
      `<table class="table table-sm mb-2"><tbody>${rows}</tbody></table>
       <small class="text-secondary">Updated: ${formatUpdated(data.updated)}</small>`
    );
  } catch (err) {
    openModal('Popular Rates', `<div class="alert alert-danger mb-0">${err.message || 'Could not load rates.'}</div>`);
  }
});

$('statusLink').addEventListener('click', async (e) => {
  e.preventDefault();
  openModal('API Status', '<p class="mb-0">Checking…</p>');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (!data.success) throw new Error();
    openModal(
      'API Status',
      `<span class="badge text-bg-success me-2">Online</span>
       Exchange-rate API is responding.<br>
       <small class="text-secondary">Last data update: ${formatUpdated(data.updated)}</small>`
    );
  } catch {
    openModal('API Status', '<span class="badge text-bg-danger me-2">Offline</span> The exchange-rate API is not responding.');
  }
});

loadCurrencies();