// =========================================================
// Income / Revenue logic  — shared by dashboard + income page
//
// Revenue model
// -------------
// Income is counted from subscriptions joined with their plan price.
// A subscription counts as paid when its status is 'active' or 'completed'
// (i.e. it was approved and the customer paid for the plan).
// Pending / cancelled subscriptions are excluded.
//
// Date filtering uses the subscription's start_date (the date the admin
// approved it and the customer's plan began), which is when money was
// effectively received.  Falls back to created_at if start_date is null.
//
// The plans table must have a numeric `price` column (amount in INR).
// If your column is named differently, update PRICE_COLUMN below.
// =========================================================

const PAID_STATUSES  = ['active', 'completed'];
const PRICE_COLUMN   = 'price';   // column name in the plans table

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a number as Indian Rupees with the ₹ symbol and Indian
 * comma grouping (e.g. 125000 → "₹1,25,000").
 */
function formatINR(amount) {
  const n = Math.round(Number(amount) || 0);
  return '₹' + n.toLocaleString('en-IN');
}

/**
 * Return today's date as a yyyy-mm-dd string in local time.
 * Using the local date (not UTC) keeps the "today" boundary aligned
 * with the admin's wall clock, consistent with how the rest of the
 * dashboard uses new Date().toISOString().split('T')[0].
 */
function todayLocalStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Return the first day of the current month as yyyy-mm-dd.
 */
function firstOfMonthStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

/**
 * Given an array of subscription rows (each with a nested plans object),
 * sum the plan prices — skipping rows where price is missing or non-numeric.
 */
function sumPrices(rows) {
  return (rows || []).reduce((acc, row) => {
    const price = Number(row.plans?.[PRICE_COLUMN]);
    return acc + (Number.isFinite(price) ? price : 0);
  }, 0);
}

// ── Core data fetch ────────────────────────────────────────────────────────

/**
 * Fetch all paid subscriptions with their plan price in one query,
 * then compute today/monthly/total splits client-side.
 *
 * Returns: { todayIncome, monthlyIncome, totalIncome, breakdown }
 *   breakdown  → array of individual rows for the detail table.
 *
 * A single round-trip is preferred over three separate filtered queries
 * so we don't hammer the DB and can reuse the result for the table.
 */
async function fetchIncomeData() {
  const { data, error } = await supabaseClient
    .from('subscriptions')
    .select(`
      id,
      start_date,
      created_at,
      status,
      vehicle_model,
      plans ( tier_name, ${PRICE_COLUMN} ),
      clients ( full_name )
    `)
    .in('status', PAID_STATUSES)
    .order('start_date', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[Income] Failed to fetch subscription data:', error);
    return { todayIncome: 0, monthlyIncome: 0, totalIncome: 0, breakdown: [], error };
  }

  const rows      = data || [];
  const todayStr  = todayLocalStr();
  const monthStr  = firstOfMonthStr();  // yyyy-mm-01

  // Effective payment date: prefer start_date (admin-confirmed), fallback created_at.
  const effectiveDate = (row) => (row.start_date || row.created_at || '').slice(0, 10);

  const todayRows   = rows.filter(r => effectiveDate(r) === todayStr);
  const monthRows   = rows.filter(r => effectiveDate(r) >= monthStr && effectiveDate(r) <= todayStr);

  return {
    todayIncome:   sumPrices(todayRows),
    monthlyIncome: sumPrices(monthRows),
    totalIncome:   sumPrices(rows),
    breakdown:     rows,
    error:         null,
  };
}

// ── Dashboard card updater ─────────────────────────────────────────────────

/**
 * Load and display income in the three dashboard summary cards.
 * Called from dashboard-admin.js → init().
 * Silently no-ops if the card elements don't exist on the page.
 */
async function loadDashboardIncomeCards() {
  const todayEl  = document.getElementById('cardIncomeToday');
  const monthEl  = document.getElementById('cardIncomeMonth');
  const totalEl  = document.getElementById('cardIncomeTotal');

  // Not on the dashboard page — nothing to do.
  if (!todayEl && !monthEl && !totalEl) return;

  const { todayIncome, monthlyIncome, totalIncome, error } = await fetchIncomeData();

  if (error) {
    if (todayEl) todayEl.textContent = 'Error';
    if (monthEl) monthEl.textContent = 'Error';
    if (totalEl) totalEl.textContent = 'Error';
    return;
  }

  if (todayEl) todayEl.textContent = formatINR(todayIncome);
  if (monthEl) monthEl.textContent = formatINR(monthlyIncome);
  if (totalEl) totalEl.textContent = formatINR(totalIncome);
}

// ── Full income page ───────────────────────────────────────────────────────

/**
 * Initialise the full /admin/income.html page.
 * Renders the three headline cards + a sortable breakdown table.
 */
async function initIncomePage() {
  const adminUser = await requireAdmin();
  if (!adminUser) return;

  initAdminShell('income.html', adminUser);

  const { todayIncome, monthlyIncome, totalIncome, breakdown, error } =
    await fetchIncomeData();

  // Hide spinner, show content.
  document.getElementById('pageLoading').style.display  = 'none';
  document.getElementById('pageContent').style.display  = 'block';

  if (error) {
    document.getElementById('incomeError').style.display = 'block';
    return;
  }

  // Headline cards.
  document.getElementById('incomeTodayVal').textContent   = formatINR(todayIncome);
  document.getElementById('incomeMonthVal').textContent   = formatINR(monthlyIncome);
  document.getElementById('incomeTotalVal').textContent   = formatINR(totalIncome);

  // Breakdown table.
  renderIncomeTable(breakdown);
}

function renderIncomeTable(rows) {
  const tbody   = document.getElementById('incomeBody');
  const emptyEl = document.getElementById('incomeEmpty');
  const tableEl = document.getElementById('incomeTable');

  if (!rows || rows.length === 0) {
    tableEl.style.display  = 'none';
    emptyEl.style.display  = 'block';
    return;
  }

  tableEl.style.display  = 'table';
  emptyEl.style.display  = 'none';

  tbody.innerHTML = rows.map(row => {
    const name      = row.clients?.full_name  || '—';
    const plan      = row.plans?.tier_name    || '—';
    const vehicle   = row.vehicle_model        || '—';
    const price     = Number(row.plans?.[PRICE_COLUMN]);
    const amount    = Number.isFinite(price) ? formatINR(price) : '—';
    const dateStr   = (row.start_date || row.created_at || '').slice(0, 10);
    const dateLabel = dateStr ? formatDate(dateStr) : '—';
    const statusBadge = badgeHtml(row.status);

    return `
      <tr>
        <td>${name}</td>
        <td>${vehicle}</td>
        <td>${plan}</td>
        <td>${dateLabel}</td>
        <td class="income-amount-cell">${amount}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}
