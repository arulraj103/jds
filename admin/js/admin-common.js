// =========================================================
// Shared admin shell helpers — sidebar, mobile toggle, toast
// =========================================================

const ADMIN_NAV_ITEMS = [
  { href: 'index.html', label: 'Dashboard', icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="12" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="15" width="8" height="6" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>' },
  { href: 'customers.html', label: 'Customers', icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 4.5c1.5.3 2.6 1.7 2.6 3.3S17.5 10.8 16 11.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17.5 14.3c2 .6 3.5 2.4 3.5 4.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  { href: 'bookings.html', label: 'Bookings', icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' },
  { href: 'income.html', label: 'Income', icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { href: 'settings.html', label: 'Settings', icon: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a1.7 1.7 0 000-3l-1.1-.3a7.3 7.3 0 00-.7-1.7l.6-1a1.7 1.7 0 00-2.4-2.4l-1 .6a7.3 7.3 0 00-1.7-.7L13 3.6a1.7 1.7 0 00-3 0l-.3 1.1a7.3 7.3 0 00-1.7.7l-1-.6a1.7 1.7 0 00-2.4 2.4l.6 1a7.3 7.3 0 00-.7 1.7L3.6 11a1.7 1.7 0 000 3l1.1.3c.15.6.4 1.17.7 1.7l-.6 1a1.7 1.7 0 002.4 2.4l1-.6c.53.3 1.1.55 1.7.7l.3 1.1a1.7 1.7 0 003 0l.3-1.1a7.3 7.3 0 001.7-.7l1 .6a1.7 1.7 0 002.4-2.4l-.6-1c.3-.53.55-1.1.7-1.7l1.1-.3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' },
];

function renderAdminSidebar(activePage, adminEmail) {
  const navHtml = ADMIN_NAV_ITEMS.map(item => `
    <a href="${item.href}" class="${item.href === activePage ? 'active' : ''}">
      ${item.icon}
      <span>${item.label}</span>
    </a>
  `).join('');

  return `
    <div class="admin-topbar">
      <img src="https://res.cloudinary.com/dmr5kchzw/image/upload/v1786601006/Add_red_elements_to_image_202608131118_1_rtqnyl.png" alt="Just Detail">
      <button class="admin-menu-toggle" id="adminMenuToggle" aria-label="Toggle menu">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <aside class="admin-sidebar" id="adminSidebar">
      <div class="admin-sidebar-logo">
        <img src="https://res.cloudinary.com/dmr5kchzw/image/upload/v1786601006/Add_red_elements_to_image_202608131118_1_rtqnyl.png" alt="Just Detail">
        <span>Admin Panel</span>
      </div>
      <nav class="admin-nav">${navHtml}</nav>
      <div class="admin-sidebar-footer">
        <div class="admin-user-email">${adminEmail || ''}</div>
        <button class="admin-logout-btn" id="adminLogoutBtn">Log Out</button>
      </div>
    </aside>
  `;
}

function initAdminShell(activePage, adminUser) {
  const shellTarget = document.getElementById('adminShell');
  shellTarget.insertAdjacentHTML('afterbegin', renderAdminSidebar(activePage, adminUser ? adminUser.email : ''));

  document.getElementById('adminLogoutBtn').addEventListener('click', adminSignOut);

  const menuToggle = document.getElementById('adminMenuToggle');
  const sidebar = document.getElementById('adminSidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
}

function showToast(message, type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function badgeHtml(status) {
  const labels = {
    pending_confirmation: 'Pending',
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Pending',
    confirmed: 'Confirmed',
    rescheduled_by_admin: 'Rescheduled',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}