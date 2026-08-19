// =========================================================
// Admin Bookings — filterable list with status actions
// IMPORTANT: washes_used/washes_remaining are updated automatically
// by a database trigger when a booking's status becomes 'completed'.
// This file never writes to those columns directly.
// =========================================================

let currentFilter = 'today';

async function init() {
  const adminUser = await requireAdmin();
  if (!adminUser) return;

  initAdminShell('bookings.html', adminUser);

  document.querySelectorAll('#statusFilters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#statusFilters .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      loadBookings();
    });
  });

  await loadBookings();
  document.getElementById('pageLoading').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';
}

async function loadBookings() {
  const todayStr = new Date().toISOString().split('T')[0];

  let query = supabaseClient
    .from('bookings')
    .select('*, subscriptions(vehicle_model, clients(full_name))');

  if (currentFilter === 'today') {
    query = query.eq('requested_date', todayStr).in('status', ['pending', 'confirmed', 'rescheduled_by_admin']);
  } else if (currentFilter === 'upcoming') {
    query = query.gt('requested_date', todayStr).in('status', ['pending', 'confirmed', 'rescheduled_by_admin']);
  } else if (currentFilter === 'completed') {
    query = query.eq('status', 'completed');
  } else if (currentFilter === 'cancelled') {
    query = query.eq('status', 'cancelled');
  }

  const { data, error } = await query.order('requested_date', { ascending: currentFilter !== 'completed' });

  renderBookingsTable(data || [], error);
}

function renderBookingsTable(data, error) {
  const tbody = document.getElementById('bookingsBody');
  const emptyEl = document.getElementById('bookingsEmpty');
  const tableEl = document.getElementById('bookingsTable');

  if (error || !data || data.length === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    if (error) console.error('Failed to load bookings:', error);
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
        <td>${formatDate(b.confirmed_date || b.requested_date)}</td>
        <td>${b.confirmed_time || b.requested_time || '—'}</td>
        <td>${visitTypeLabel(b.visit_type)}</td>
        <td>${badgeHtml(b.status)}</td>
        <td>${renderActions(b)}</td>
      </tr>
    `;
  }).join('');

  wireUpActions();
}

function renderActions(b) {
  if (b.status === 'pending') {
    return `
      <div class="btn-row">
        <button class="btn btn-success btn-sm" data-confirm="${b.id}">Confirm</button>
        <button class="btn btn-danger btn-sm" data-cancel="${b.id}">Cancel</button>
      </div>`;
  }
  if (b.status === 'confirmed' || b.status === 'rescheduled_by_admin') {
    return `
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" data-complete="${b.id}">Mark Completed</button>
        <button class="btn btn-danger btn-sm" data-cancel="${b.id}">Cancel</button>
      </div>`;
  }
  return '—';
}

function wireUpActions() {
  document.querySelectorAll('[data-confirm]').forEach(btn => {
    btn.addEventListener('click', () => updateBookingStatus(btn.dataset.confirm, 'confirmed', btn));
  });
  document.querySelectorAll('[data-cancel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = prompt('Optional: add a reason the customer will see.', '');
      if (note === null) return;
      updateBookingStatus(btn.dataset.cancel, 'cancelled', btn, note);
    });
  });
  document.querySelectorAll('[data-complete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Mark this booking as completed? This will count as one used wash for the customer.')) {
        updateBookingStatus(btn.dataset.complete, 'completed', btn);
      }
    });
  });
}

async function updateBookingStatus(bookingId, newStatus, btnEl, note) {
  btnEl.disabled = true;

  const updatePayload = { status: newStatus };
  if (note) updatePayload.admin_note = note;

  // The DB trigger (handle_booking_completion) automatically adjusts the
  // linked subscription's washes_used/washes_remaining when status becomes
  // 'completed' — no manual wash-count logic needed here.
  const { error } = await supabaseClient
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId);

  if (error) {
    showToast('Failed to update booking: ' + error.message, 'error');
    btnEl.disabled = false;
    return;
  }

  const messages = {
    confirmed: 'Booking confirmed.',
    cancelled: 'Booking cancelled.',
    completed: 'Marked as completed — wash count updated.',
  };
  showToast(messages[newStatus] || 'Booking updated.');

  await loadBookings();
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

document.addEventListener('DOMContentLoaded', init);