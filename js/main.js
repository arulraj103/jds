// =========================================================
// General site interactions
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });
    // Close menu after clicking a link (mobile)
    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Generic WhatsApp contact link
  const waLink = document.getElementById('contactWhatsapp');
  if (waLink) {
    waLink.href = `https://wa.me/${OWNER_WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi, I\'d like to know more about Just Detail services.')}`;
  }

  // Toggle between plain "Care Plan Login" link and account dropdown
  // depending on whether the visitor has an active session.
  const navLoginLink = document.getElementById('navLoginLink');
  const navAccountMenu = document.getElementById('navAccountMenu');
  const navAccountBtn = document.getElementById('navAccountBtn');
  const navAccountDropdown = document.getElementById('navAccountDropdown');
  const navAccountName = document.getElementById('navAccountName');
  const navLogoutBtn = document.getElementById('navLogoutBtn');

  if (navLoginLink && navAccountMenu && typeof supabaseClient !== 'undefined') {
    supabaseClient.auth.getUser().then(async ({ data }) => {
      if (data && data.user) {
        navLoginLink.style.display = 'none';
        navAccountMenu.style.display = 'block';

        // Try to show the client's first name instead of a generic "Account"
        const { data: clientRow } = await supabaseClient
          .from('clients')
          .select('full_name')
          .eq('id', data.user.id)
          .maybeSingle();
        if (clientRow && clientRow.full_name) {
          navAccountName.textContent = clientRow.full_name.split(' ')[0];
        }
      }
    });
  }

  if (navAccountBtn && navAccountDropdown) {
    navAccountBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navAccountDropdown.classList.toggle('open');
      navAccountBtn.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', () => {
      navAccountDropdown.classList.remove('open');
      navAccountBtn.setAttribute('aria-expanded', 'false');
    });
  }

  if (navLogoutBtn) {
    navLogoutBtn.addEventListener('click', async () => {
      if (typeof supabaseClient !== 'undefined') {
        await supabaseClient.auth.signOut();
      }
      window.location.reload();
    });
  }
});