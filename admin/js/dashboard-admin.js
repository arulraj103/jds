// =========================================================
// Admin Dashboard
// =========================================================

async function init() {
  const adminUser = await requireAdmin();
  if (!adminUser) return;

  initAdminShell('index.html', adminUser);

  await Promise.all([
    loadSummaryCards(),
    loadDashboardIncomeCards(),   // Income cards — defined in income-admin.js
    loadPendingVisits(),
    loadTodayBookings(),
    loadPendingRequests(),
  ]);

  document.getElementById('pageLoading').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';
}

async function loadSummaryCards() {
  const todayStr = new Date().toISOString().split('T')[0];

  const [activeSubs, pendingSubs, todayBookings, upcomingBookings] = await Promise.all([
    supabaseClient.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseClient.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'pending_confirmation'),
    supabaseClient.from('bookings').select('id', { count: 'exact', head: true })
      .eq('requested_date', todayStr).in('status', ['pending', 'confirmed']),
    supabaseClient.from('bookings').select('id', { count: 'exact', head: true })
      .gt('requested_date', todayStr).in('status', ['pending', 'confirmed']),
  ]);

  document.getElementById('cardActiveClients').textContent = activeSubs.count ?? 0;
  document.getElementById('cardPendingRequests').textContent = pendingSubs.count ?? 0;
  document.getElementById('cardTodayBookings').textContent = todayBookings.count ?? 0;
  document.getElementById('cardUpcomingBookings').textContent = upcomingBookings.count ?? 0;
}

async function loadTodayBookings() {
  const todayStr = new Date().toISOString().split('T')[0];

  const { data, error } = await supabaseClient
    .from('bookings')
    .select('*, subscriptions(vehicle_model, clients(full_name))')
    .eq('requested_date', todayStr)
    .order('requested_time', { ascending: true });

  const tbody = document.getElementById('todayBookingsBody');
  const emptyEl = document.getElementById('todayBookingsEmpty');
  const tableEl = document.getElementById('todayBookingsTable');

  if (error || !data || data.length === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  tableEl.style.display = 'table';
  emptyEl.style.display = 'none';

  tbody.innerHTML = data.map(b => {
    const customerName = b.subscriptions?.clients?.full_name || '—';
    const vehicle = b.subscriptions?.vehicle_model || '—';
    return `
      <tr>
        <td>${b.confirmed_time || b.requested_time || '—'}</td>
        <td>${customerName}</td>
        <td>${vehicle}</td>
        <td>${visitTypeLabel(b.visit_type)}</td>
        <td>${badgeHtml(b.status)}</td>
      </tr>
    `;
  }).join('');
}

function visitTypeLabel(type) {
  const map = {
    deep_clean: 'Deep Clean',
    maintenance_wash: 'Maintenance Wash',
    mid_year_reset: 'Mid-Year Reset',
    bonus_perk: 'Bonus Perk',
  };
  return map[type] || type;
}

async function loadPendingVisits() {
  const { data, error } = await supabaseClient
    .from('bookings')
    .select('*, subscriptions(vehicle_model, clients(full_name))')
    .eq('status', 'pending')
    .order('requested_date', { ascending: true });

  const tbody = document.getElementById('pendingVisitsBody');
  const emptyEl = document.getElementById('pendingVisitsEmpty');
  const tableEl = document.getElementById('pendingVisitsTable');

  if (error || !data || data.length === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  tableEl.style.display = 'table';
  emptyEl.style.display = 'none';

  tbody.innerHTML = data.map(b => {
    const customerName = b.subscriptions?.clients?.full_name || '—';
    const vehicle = b.subscriptions?.vehicle_model || '—';
    return `
      <tr>
        <td>${customerName}</td>
        <td>${vehicle}</td>
        <td>${formatDate(b.requested_date)}</td>
        <td>${b.requested_time || '—'}</td>
        <td>
          <div class="btn-row">
            <button class="btn btn-success btn-sm" data-confirm-visit="${b.id}">Confirm</button>
            <button class="btn btn-danger btn-sm" data-cancel-visit="${b.id}">Cancel</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-confirm-visit]').forEach(btn => {
    btn.addEventListener('click', () => updateVisitStatus(btn.dataset.confirmVisit, 'confirmed', btn));
  });
  tbody.querySelectorAll('[data-cancel-visit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = prompt('Optional: add a reason the customer will see (e.g. "That slot is booked — please pick another date").', '');
      if (note === null) return; // user hit Cancel on the prompt itself
      updateVisitStatus(btn.dataset.cancelVisit, 'cancelled', btn, note);
    });
  });
}

async function updateVisitStatus(bookingId, newStatus, btnEl, note) {
  btnEl.disabled = true;
  const updatePayload = { status: newStatus };
  if (note) updatePayload.admin_note = note;

  const { error } = await supabaseClient.from('bookings').update(updatePayload).eq('id', bookingId);

  if (error) {
    showToast('Failed to update: ' + error.message, 'error');
    btnEl.disabled = false;
    return;
  }

  showToast(newStatus === 'confirmed' ? 'Visit confirmed.' : 'Visit cancelled.');
  await Promise.all([loadSummaryCards(), loadPendingVisits(), loadTodayBookings()]);
}

async function loadPendingRequests() {
  const { data, error } = await supabaseClient
    .from('subscriptions')
    .select('*, clients(full_name), plans(tier_name)')
    .eq('status', 'pending_confirmation')
    .order('created_at', { ascending: true });

  const tbody = document.getElementById('pendingBody');
  const emptyEl = document.getElementById('pendingEmpty');
  const tableEl = document.getElementById('pendingTable');

  if (error || !data || data.length === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  tableEl.style.display = 'table';
  emptyEl.style.display = 'none';

  tbody.innerHTML = data.map(sub => `
    <tr>
      <td>${sub.clients?.full_name || '—'}</td>
      <td>${sub.vehicle_model || '—'}</td>
      <td>${sub.plans?.tier_name || '—'}</td>
      <td>${formatDate(sub.created_at)}</td>
      <td>
        <div class="btn-row">
          <button class="btn btn-success btn-sm" data-approve="${sub.id}">Approve</button>
          <button class="btn btn-danger btn-sm" data-reject="${sub.id}">Reject</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', () => approveSubscription(btn.dataset.approve, btn));
  });
  tbody.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', () => rejectSubscription(btn.dataset.reject, btn));
  });
}

async function approveSubscription(id, btnEl) {
  btnEl.disabled = true;
  const { error } = await supabaseClient
    .from('subscriptions')
    .update({ status: 'active', start_date: new Date().toISOString().split('T')[0] })
    .eq('id', id);

  if (error) {
    showToast('Failed to approve: ' + error.message, 'error');
    btnEl.disabled = false;
    return;
  }

  showToast('Subscription approved — now active.');
  await Promise.all([loadSummaryCards(), loadPendingRequests()]);
}

async function rejectSubscription(id, btnEl) {
  if (!confirm('Reject this maintenance request? This cannot be undone.')) return;
  btnEl.disabled = true;

  const { error } = await supabaseClient
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) {
    showToast('Failed to reject: ' + error.message, 'error');
    btnEl.disabled = false;
    return;
  }

  showToast('Request rejected.');
  await Promise.all([loadSummaryCards(), loadPendingRequests()]);
}

document.addEventListener('DOMContentLoaded', init);