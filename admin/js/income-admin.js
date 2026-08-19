// =========================================================
// Income / Revenue logic  — income page + dashboard
//
// Revenue model
// -------------
// A subscription is "paid" (counts as revenue) when status is
// 'active' or 'completed'.
// Pending / cancelled / failed / refunded subscriptions are excluded
// from revenue totals but shown in the Recent Transactions table.
//
// Transaction status mapping (subscription.status → display):
//   active / completed  → Paid
//   pending / pending_confirmation → Pending
//   cancelled           → Failed   (treat as failed payment)
//   refunded            → Refunded
//
// Date filtering uses start_date (admin-approved date), falling back
// to created_at if start_date is null.
// =========================================================

const PAID_STATUSES  = ['active', 'completed'];
const PRICE_COLUMN   = 'price';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(amount) {
  const n = Math.round(Number(amount) || 0);
  return '₹' + n.toLocaleString('en-IN');
}

function todayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

function sumPrices(rows) {
  return (rows || []).reduce((acc, row) => {
    const price = Number(row.plans?.[PRICE_COLUMN]);
    return acc + (Number.isFinite(price) ? price : 0);
  }, 0);
}

/**
 * Map a subscription status to a transaction display status.
 * Returns one of: 'paid' | 'pending' | 'failed' | 'refunded'
 */
function txnStatus(subStatus) {
  if (!subStatus) return 'pending';
  const s = subStatus.toLowerCase();
  if (s === 'active' || s === 'completed') return 'paid';
  if (s === 'pending' || s === 'pending_confirmation') return 'pending';
  if (s === 'refunded') return 'refunded';
  // cancelled and anything else → failed
  return 'failed';
}

/**
 * Render a payment-status badge.
 * paid=green, pending=yellow, failed=red, refunded=gray
 */
function txnStatusBadge(status) {
  const map = {
    paid:     { cls: 'txn-badge-paid',     label: 'Paid' },
    pending:  { cls: 'txn-badge-pending',  label: 'Pending' },
    failed:   { cls: 'txn-badge-failed',   label: 'Failed' },
    refunded: { cls: 'txn-badge-refunded', label: 'Refunded' },
  };
  const { cls, label } = map[status] || map.pending;
  return `<span class="txn-badge ${cls}">${label}</span>`;
}

/**
 * Return the effective payment date (yyyy-mm-dd) for a subscription row.
 */
function effectiveDate(row) {
  return (row.start_date || row.created_at || '').slice(0, 10);
}

// ── Core data fetch ────────────────────────────────────────────────────────

/**
 * Fetch ALL subscriptions (all statuses) so we can:
 *   • Show full Recent Transactions table with correct statuses
 *   • Compute revenue only from paid ones
 */
async function fetchAllSubscriptions() {
  const { data, error } = await supabaseClient
    .from('subscriptions')
    .select(`
      id,
      start_date,
      created_at,
      status,
      vehicle_model,
      payment_method,
      plans ( tier_name, ${PRICE_COLUMN} ),
      clients ( full_name )
    `)
    .order('start_date', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[Income] Failed to fetch subscription data:', error);
    return { rows: [], error };
  }
  return { rows: data || [], error: null };
}

/**
 * From all rows, compute income metrics using only paid statuses.
 */
function computeIncomeMetrics(rows) {
  const paidRows  = rows.filter(r => PAID_STATUSES.includes(r.status));
  const todayStr  = todayLocalStr();
  const monthStr  = firstOfMonthStr();

  const todayRows  = paidRows.filter(r => effectiveDate(r) === todayStr);
  const monthRows  = paidRows.filter(r => effectiveDate(r) >= monthStr && effectiveDate(r) <= todayStr);

  return {
    todayIncome:   sumPrices(todayRows),
    monthlyIncome: sumPrices(monthRows),
    totalIncome:   sumPrices(paidRows),
    breakdown:     paidRows,
  };
}

/**
 * Compute monthly revenue for a given year from paid rows only.
 * Returns array of 12 numbers (Jan–Dec).
 */
function computeMonthlyRevenue(allRows, year) {
  const paidRows = allRows.filter(r => PAID_STATUSES.includes(r.status));
  const monthly  = new Array(12).fill(0);

  for (const row of paidRows) {
    const d = effectiveDate(row);
    if (!d) continue;
    const rowYear  = parseInt(d.slice(0, 4), 10);
    const rowMonth = parseInt(d.slice(5, 7), 10) - 1; // 0-indexed
    if (rowYear === year && rowMonth >= 0 && rowMonth < 12) {
      const price = Number(row.plans?.[PRICE_COLUMN]);
      if (Number.isFinite(price)) monthly[rowMonth] += price;
    }
  }
  return monthly;
}

/**
 * Extract all unique years present in paid data.
 * Falls back to current year if no data.
 */
function extractYears(allRows) {
  const paidRows = allRows.filter(r => PAID_STATUSES.includes(r.status));
  const years    = new Set();
  for (const row of paidRows) {
    const d = effectiveDate(row);
    if (d) years.add(parseInt(d.slice(0, 4), 10));
  }
  // Always include current year
  years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => b - a); // descending
}

// ── Dashboard card updater ─────────────────────────────────────────────────

async function loadDashboardIncomeCards() {
  const todayEl  = document.getElementById('cardIncomeToday');
  const monthEl  = document.getElementById('cardIncomeMonth');
  const totalEl  = document.getElementById('cardIncomeTotal');
  if (!todayEl && !monthEl && !totalEl) return;

  const { rows, error } = await fetchAllSubscriptions();
  if (error) {
    if (todayEl) todayEl.textContent = 'Error';
    if (monthEl) monthEl.textContent = 'Error';
    if (totalEl) totalEl.textContent = 'Error';
    return;
  }

  const { todayIncome, monthlyIncome, totalIncome } = computeIncomeMetrics(rows);
  if (todayEl) todayEl.textContent = formatINR(todayIncome);
  if (monthEl) monthEl.textContent = formatINR(monthlyIncome);
  if (totalEl) totalEl.textContent = formatINR(totalIncome);
}

// ── Chart instance ─────────────────────────────────────────────────────────

let _chartInstance = null;

function renderMonthlyChart(monthlyData) {
  const canvas = document.getElementById('monthlyChart');
  if (!canvas) return;

  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }

  const ctx = canvas.getContext('2d');

  // Pull CSS variables for consistent theming
  const style      = getComputedStyle(document.documentElement);
  const red        = style.getPropertyValue('--red').trim()        || '#e31e24';
  const redLight   = 'rgba(227,30,36,0.10)';
  const gridColor  = 'rgba(13,13,13,0.07)';
  const labelColor = '#8a8a8d';

  _chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTH_SHORT,
      datasets: [{
        label: 'Revenue (₹)',
        data: monthlyData,
        backgroundColor: monthlyData.map(v => v > 0 ? red : redLight),
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 48,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + formatINR(ctx.parsed.y),
          },
          backgroundColor: '#17181a',
          titleColor: '#c9c9cc',
          bodyColor: '#ffffff',
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: labelColor, font: { family: 'Inter', size: 12, weight: '600' } },
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: labelColor,
            font: { family: 'Inter', size: 12 },
            callback: v => formatINR(v),
            maxTicksLimit: 6,
          },
        },
      },
    },
  });
}

function updateYearlyDisplay(allRows, year) {
  const monthly = computeMonthlyRevenue(allRows, year);

  // Chart
  renderMonthlyChart(monthly);

  // Monthly table grid
  const grid = document.getElementById('monthlyRevenueGrid');
  if (grid) {
    grid.innerHTML = monthly.map((amt, i) => `
      <div class="monthly-rev-row">
        <span class="monthly-rev-month">${MONTH_NAMES[i]}</span>
        <span class="monthly-rev-amount ${amt > 0 ? 'monthly-rev-has-value' : 'monthly-rev-zero'}">${formatINR(amt)}</span>
      </div>
    `).join('');
  }

  // Yearly summary
  const total    = monthly.reduce((a, b) => a + b, 0);
  const bestIdx  = monthly.indexOf(Math.max(...monthly));
  const bestAmt  = monthly[bestIdx] || 0;
  const avg      = Math.round(total / 12);

  const summaryTitleEl = document.getElementById('yearlySummaryTitle');
  if (summaryTitleEl) summaryTitleEl.textContent = `${year} Summary`;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('summaryTotal',       formatINR(total));
  setEl('summaryBestMonth',   total > 0 ? MONTH_NAMES[bestIdx] : '—');
  setEl('summaryBestRevenue', total > 0 ? formatINR(bestAmt) : '—');
  setEl('summaryAvg',         formatINR(avg));
}

// ── Recent Transactions table ──────────────────────────────────────────────

let _allTxnRows = [];
let _activeFilter = 'all';

function renderTxnTable(rows) {
  const tbody   = document.getElementById('txnBody');
  const emptyEl = document.getElementById('txnEmpty');
  const tableEl = document.getElementById('txnTable');

  // Filter
  const filtered = _activeFilter === 'all'
    ? rows
    : rows.filter(r => txnStatus(r.status) === _activeFilter);

  if (!filtered || filtered.length === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  tableEl.style.display = 'table';
  emptyEl.style.display = 'none';

  tbody.innerHTML = filtered.map(row => {
    const name          = row.clients?.full_name || '—';
    const plan          = row.plans?.tier_name   || '—';
    const price         = Number(row.plans?.[PRICE_COLUMN]);
    const amount        = Number.isFinite(price) ? formatINR(price) : '—';
    const paymentMethod = row.payment_method     || '—';
    const dateStr       = effectiveDate(row);
    const dateLabel     = dateStr ? formatDate(dateStr) : '—';
    const status        = txnStatus(row.status);
    const badgeHtml     = txnStatusBadge(status);

    return `
      <tr>
        <td>${name}</td>
        <td>${plan}</td>
        <td class="income-amount-cell">${amount}</td>
        <td>${paymentMethod}</td>
        <td>${dateLabel}</td>
        <td>${badgeHtml}</td>
      </tr>
    `;
  }).join('');
}

function initTxnFilters() {
  const filterContainer = document.getElementById('txnFilters');
  if (!filterContainer) return;

  filterContainer.addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;

    filterContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    _activeFilter = chip.dataset.status;
    renderTxnTable(_allTxnRows);
  });
}

// ── Plan Revenue Breakdown table (existing) ────────────────────────────────

function renderIncomeTable(rows) {
  const tbody   = document.getElementById('incomeBody');
  const emptyEl = document.getElementById('incomeEmpty');
  const tableEl = document.getElementById('incomeTable');

  if (!rows || rows.length === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  tableEl.style.display = 'table';
  emptyEl.style.display = 'none';

  tbody.innerHTML = rows.map(row => {
    const name      = row.clients?.full_name  || '—';
    const plan      = row.plans?.tier_name    || '—';
    const vehicle   = row.vehicle_model       || '—';
    const price     = Number(row.plans?.[PRICE_COLUMN]);
    const amount    = Number.isFinite(price) ? formatINR(price) : '—';
    const dateStr   = effectiveDate(row);
    const dateLabel = dateStr ? formatDate(dateStr) : '—';
    const sb        = badgeHtml(row.status);

    return `
      <tr>
        <td>${name}</td>
        <td>${vehicle}</td>
        <td>${plan}</td>
        <td>${dateLabel}</td>
        <td class="income-amount-cell">${amount}</td>
        <td>${sb}</td>
      </tr>
    `;
  }).join('');
}

// ── Full income page init ──────────────────────────────────────────────────

async function initIncomePage() {
  const adminUser = await requireAdmin();
  if (!adminUser) return;

  initAdminShell('income.html', adminUser);

  // Fetch all subscription rows
  const { rows: allRows, error } = await fetchAllSubscriptions();

  document.getElementById('pageLoading').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';

  if (error) {
    document.getElementById('incomeError').style.display = 'block';
    return;
  }

  // Headline income cards (paid only)
  const { todayIncome, monthlyIncome, totalIncome, breakdown } = computeIncomeMetrics(allRows);
  document.getElementById('incomeTodayVal').textContent  = formatINR(todayIncome);
  document.getElementById('incomeMonthVal').textContent  = formatINR(monthlyIncome);
  document.getElementById('incomeTotalVal').textContent  = formatINR(totalIncome);

  // Recent Transactions — all rows, with txn status from subscription status
  _allTxnRows = allRows;
  initTxnFilters();
  renderTxnTable(_allTxnRows);

  // Plan Revenue Breakdown — paid only (existing section)
  renderIncomeTable(breakdown);

  // Monthly Revenue — year selector
  const years      = extractYears(allRows);
  const yearSelect = document.getElementById('yearSelect');
  if (yearSelect) {
    yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSelect.value = years[0]; // most recent year selected by default

    // Initial render
    updateYearlyDisplay(allRows, years[0]);

    yearSelect.addEventListener('change', () => {
      updateYearlyDisplay(allRows, parseInt(yearSelect.value, 10));
    });
  }
}
