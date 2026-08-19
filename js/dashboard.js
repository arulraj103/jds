// =========================================================
// Dashboard: guards access, loads subscriptions, handles
// enrollment and visit-request flows.
// =========================================================

let currentUser = null;
let currentClientRow = null;
let currentSubscriptions = [];

async function init() {
  currentUser = await requireAuth();
  if (!currentUser) return; // requireAuth already redirects to login

  document.getElementById('logoutBtn').addEventListener('click', signOutClient);

  // Load (or create-on-first-login) the client's profile row
  const { data: clientRow, error: clientErr } = await supabaseClient
    .from('clients')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (clientErr) {
    console.error('Failed to load client profile:', clientErr);
  }
  currentClientRow = clientRow;

  if (currentClientRow) {
    document.getElementById('dashUserName').textContent = currentClientRow.full_name;
    document.getElementById('dashWelcomeName').textContent = ', ' + currentClientRow.full_name.split(' ')[0];
  }

  document.getElementById('dashLoading').style.display = 'none';

  const params = new URLSearchParams(window.location.search);
  const enrollPlanId = params.get('enroll');

  if (enrollPlanId) {
    await showEnrollPanel(enrollPlanId);
  } else {
    await loadSubscriptions();
    document.getElementById('dashContent').style.display = 'block';
  }
}

// ---------------- Enrollment flow ----------------
async function showEnrollPanel(planId) {
  const { data: plan, error } = await supabaseClient
    .from('plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();

  if (error || !plan) {
    console.error('Plan not found:', error);
    await loadSubscriptions();
    document.getElementById('dashContent').style.display = 'block';
    return;
  }

  document.getElementById('enrollPanel').style.display = 'block';
  document.getElementById('enrollPlanTitle').textContent = `Enroll — ${plan.tier_name}`;
  document.getElementById('enrollPlanSub').textContent =
    `${plan.vehicle_segment === 'suv' ? 'SUV / MPV / Large SUV' : 'Sedan / Hatch / Compact SUV'} · ₹${Number(plan.price).toLocaleString('en-IN')} · ${plan.total_regular_washes} washes`;

  const freqSelect = document.getElementById('enFrequency');
  freqSelect.innerHTML = plan.frequency_options.map(f =>
    `<option value="${f}">${f === 'biweekly' ? 'Bi-weekly' : 'Monthly'}</option>`
  ).join('');
  // Hide the frequency choice entirely if the plan only offers one option
  document.getElementById('enFrequencyRow').style.display = plan.frequency_options.length > 1 ? 'flex' : 'none';

  document.getElementById('enrollCancel').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  document.getElementById('enrollForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('enrollSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    const vehicleModel = document.getElementById('enVehicleModel').value.trim();
    const frequency = freqSelect.value || plan.frequency_options[0];
    const address = document.getElementById('enAddress').value.trim();

    const { error: insertError } = await supabaseClient.from('subscriptions').insert({
      client_id: currentUser.id,
      plan_id: plan.id,
      vehicle_model: vehicleModel,
      vehicle_segment: plan.vehicle_segment,
      frequency: frequency,
      washes_remaining: plan.total_regular_washes,
      service_address: address,
      status: 'pending_confirmation',
    });

    if (insertError) {
      alert('Something went wrong submitting your enrollment: ' + insertError.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit enrollment';
      return;
    }

    // Clean the ?enroll= param and show the dashboard with the new pending subscription
    window.history.replaceState({}, '', 'dashboard.html');
    document.getElementById('enrollPanel').style.display = 'none';
    await loadSubscriptions();
    document.getElementById('dashContent').style.display = 'block';
  });
}

// ---------------- Load subscriptions ----------------
async function loadSubscriptions() {
  const { data, error } = await supabaseClient
    .from('subscriptions')
    .select('*, plans(*), bookings(*)')
    .eq('client_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load subscriptions:', error);
    currentSubscriptions = [];
  } else {
    currentSubscriptions = data || [];
  }

  renderSubscriptions();
}

function statusLabel(status) {
  const map = {
    pending_confirmation: { text: 'Awaiting confirmation', cls: 'status-pending' },
    active: { text: 'Active', cls: 'status-active' },
    completed: { text: 'Completed', cls: 'status-completed' },
    cancelled: { text: 'Cancelled', cls: 'status-cancelled' },
  };
  return map[status] || { text: status, cls: '' };
}

function renderSubscriptions() {
  const container = document.getElementById('subscriptionsList');

  if (currentSubscriptions.length === 0) {
    container.innerHTML = `
      <div class="sub-empty">
        <p>You haven't enrolled in a care plan yet.</p>
        <a href="index.html#plans" class="btn btn-primary">View care plans</a>
      </div>`;
    return;
  }

  container.innerHTML = currentSubscriptions.map(sub => {
    const status = statusLabel(sub.status);
    const segmentLabel = sub.vehicle_segment === 'suv' ? 'SUV / MPV / Large SUV' : 'Sedan / Hatch / Compact SUV';
    const canBookVisit = sub.status === 'active' && sub.washes_remaining > 0;
    const bookings = (sub.bookings || []).slice().sort((a, b) => new Date(b.requested_date) - new Date(a.requested_date));

    return `
      <div class="sub-card">
        <div class="sub-card-top">
          <div>
            <span class="sub-status ${status.cls}">${status.text}</span>
            <h3>${sub.plans ? sub.plans.tier_name : 'Care Plan'}</h3>
            <p class="sub-meta">${sub.vehicle_model || segmentLabel} · ${segmentLabel}</p>
          </div>
        </div>

        ${sub.status === 'pending_confirmation' ? `
          <p class="sub-pending-note">We've received your enrollment and will confirm shortly. You'll be able to book visits once it's active.</p>
        ` : `
          <div class="sub-stats">
            <div class="sub-stat">
              <span class="sub-stat-num">${sub.washes_remaining}</span>
              <span class="sub-stat-label">Washes left</span>
            </div>
            <div class="sub-stat">
              <span class="sub-stat-num">${sub.washes_used}</span>
              <span class="sub-stat-label">Completed</span>
            </div>
            <div class="sub-stat">
              <span class="sub-stat-num">${sub.frequency === 'biweekly' ? 'Bi-wk' : 'Monthly'}</span>
              <span class="sub-stat-label">Frequency</span>
            </div>
          </div>
        `}

        ${canBookVisit ? `<button class="btn btn-primary btn-block" onclick="openVisitModal('${sub.id}')">Request next visit</button>` : ''}

        ${bookings.length > 0 ? `
          <div class="sub-bookings">
            <p class="sub-bookings-label">Your visit requests</p>
            ${bookings.map(b => `
              <div class="sub-booking-row">
                <div class="sub-booking-info">
                  <span class="sub-booking-date">${formatVisitDate(b.confirmed_date || b.requested_date)}</span>
                  <span class="sub-booking-time">${b.confirmed_time || b.requested_time || ''}</span>
                </div>
                <span class="booking-status booking-status-${b.status}">${bookingStatusLabel(b.status)}</span>
              </div>
              ${(b.status === 'rescheduled_by_admin' || b.status === 'cancelled') && b.admin_note ? `<p class="sub-booking-note">${b.admin_note}</p>` : ''}
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function bookingStatusLabel(status) {
  const map = {
    pending: 'Pending confirmation',
    confirmed: 'Confirmed',
    rescheduled_by_admin: 'Reschedule proposed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[status] || status;
}

function formatVisitDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------- Visit request modal ----------------
function openVisitModal(subscriptionId) {
  document.getElementById('visitSubscriptionId').value = subscriptionId;
  document.getElementById('visitForm').reset();
  document.getElementById('visitSubscriptionId').value = subscriptionId; // reset() clears hidden inputs too
  document.getElementById('visitModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  const dateInput = document.getElementById('visitDate');
  const today = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', today);
}

function closeVisitModal() {
  document.getElementById('visitModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  document.getElementById('visitModalClose').addEventListener('click', closeVisitModal);
  document.getElementById('visitModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('visitModalOverlay')) closeVisitModal();
  });

  document.getElementById('visitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('visitSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending request…';

    const subscriptionId = document.getElementById('visitSubscriptionId').value;
    const date = document.getElementById('visitDate').value;
    const time = document.getElementById('visitTime').value;

    const { error } = await supabaseClient.from('bookings').insert({
      subscription_id: subscriptionId,
      visit_type: 'maintenance_wash',
      requested_date: date,
      requested_time: time,
      status: 'pending',
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Request visit';

    if (error) {
      alert('Could not submit your request: ' + error.message);
      return;
    }

    closeVisitModal();
    await loadSubscriptions();
    alert('Visit requested! We\'ll confirm your slot shortly.');
  });
});