//add-resident.js
// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureLoggedIn();
  if (!user) return;

  // Gate: if no estate linked, show setup wall and stop
  if (!user.estateId) {
    showNoEstateWall();
    return;
  }

  loadUserProfile(user);
  updateEstateName(user.estate?.name);
  updateDateTime();
  setInterval(updateDateTime, 60000);

  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // ✅ Check for page parameter in URL (e.g., /?page=residents)
  const urlParams = new URLSearchParams(window.location.search);
  const pageParam = urlParams.get('page');
  
  // Load page: use URL param if present, otherwise default to 'dashboard'
  const pageToLoad = pageParam || 'dashboard';
  loadPage(pageToLoad);
  
  // Load dashboard data (always fetch even if viewing another page)
  if (pageToLoad === 'dashboard') {
    loadDashboardData();
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════

// Returns the user object if authenticated, null otherwise
async function ensureLoggedIn() {
  const token = localStorage.getItem('token');
  if (!token) {
    redirectToLogin();
    return null;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('not authenticated');
    const data = await res.json();
    return data.user;
  } catch {
    localStorage.removeItem('token');
    redirectToLogin();
    return null;
  }
}

function redirectToLogin() {
  if (!location.pathname.endsWith('login.html')) {
    window.location.href = '/login.html';
  }
}

function loadUserProfile(user) {
  const avatarEl = document.querySelector('#user-avatar');
  const nameEl = document.querySelector('#user-name');
  const roleEl = document.querySelector('#user-role');

  if (avatarEl && user.fullName) {
    avatarEl.textContent = user.fullName.split(' ').map(w => w[0].toUpperCase()).join('');
  }
  if (nameEl) nameEl.textContent = user.fullName || 'User';
  if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Admin' : 'Member';
}

function updateEstateName(name) {
  document.querySelectorAll('#estate-name').forEach(el => {
    el.textContent = name || 'My Estate';
  });
}

async function handleLogout() {
  const token = localStorage.getItem('token');
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Logout error:', err);
  }
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

// ═══════════════════════════════════════════════════════════════
// NO-ESTATE WALL
// ═══════════════════════════════════════════════════════════════

function showNoEstateWall() {
  // Hide sidebar nav and main content, show a full-screen wall
  const container = document.querySelector('.dashboard-container');
  if (!container) return;

  container.innerHTML = `
    <div class="no-estate-wall">
      <div class="no-estate-card">
        <div class="no-estate-icon">🏘️</div>
        <h1>No Estate Linked</h1>
        <p>Your account isn't linked to any estate yet. Create your estate to get started —
           you'll be able to manage residents, invoices, payments, and more.</p>
        <a href="/create-estate.html" class="btn-create">+ Create Estate</a>
        <button onclick="handleLogout()" class="signout-link">Sign out</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// SPA PAGE LOADING
// ═══════════════════════════════════════════════════════════════

async function loadPage(pageName) {
  if (window.isLoading) return;
  window.isLoading = true;

  try {
    setActiveNav(pageName);
    const container = document.getElementById('page-container');

    if (pageName === 'dashboard') {
      container.innerHTML = getDashboardHTML();
      updatePageTitle('Dashboard', '');
      loadDashboardData();
      window.isLoading = false;
      window.scrollTo(0, 0);
      return;
    }

    const response = await fetch(`/${pageName}.html`);
    if (!response.ok) throw new Error(`Failed to load ${pageName}.html`);

    container.innerHTML = await response.text();

    const pageNames = {
      residents: 'Residents & Units', invoices: 'Invoices',
      payments: 'Payments', collections: 'Collections',
      reports: 'Reports', communications: 'Communications',
      estate: 'Estate Settings'
    };
    updatePageTitle(pageNames[pageName] || pageName, '');

    // Inject page-specific CSS if needed
    const cssPages = ['estate'];
    if (cssPages.includes(pageName)) {
      if (!document.getElementById(`css-${pageName}`)) {
        const link = document.createElement('link');
        link.id   = `css-${pageName}`;
        link.rel  = 'stylesheet';
        link.href = `/styles/${pageName}.css`;
        document.head.appendChild(link);
      }
    }

    // Remove previous page script to avoid duplicate function definitions
    const prev = document.getElementById('page-script');
    if (prev) prev.remove();

    const script = document.createElement('script');
    script.id = 'page-script';
    script.src = `/js/${pageName}.js`;
    script.onload = () => {
      const fnName = `load${pageName.charAt(0).toUpperCase() + pageName.slice(1)}`;
      if (typeof window[fnName] === 'function') window[fnName]();
      window.isLoading = false;
    };
    script.onerror = () => { window.isLoading = false; };
    document.body.appendChild(script);
    window.scrollTo(0, 0);

  } catch (error) {
    console.error('Error loading page:', error);
    document.getElementById('page-container').innerHTML = `
      <div class="card" style="text-align:center;padding:60px 40px;">
        <h2 style="color:#ef4444;margin-bottom:16px;">⚠️ Error Loading Page</h2>
        <p style="color:#64748b;">${error.message}</p>
        <button class="btn btn-primary" onclick="loadPage('dashboard')">Back to Dashboard</button>
      </div>
    `;
    window.isLoading = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION HELPERS
// ═══════════════════════════════════════════════════════════════

function setActiveNav(pageName) {
  // Desktop sidebar
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const active = document.querySelector(`.nav-link[data-page="${pageName}"]`);
  if (active) active.classList.add('active');

  // Mobile bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(l => l.classList.remove('active'));
  const activeBottom = document.querySelector(`.bottom-nav-item[data-page="${pageName}"]`);
  if (activeBottom) activeBottom.classList.add('active');
}

function updatePageTitle(title, subtitle) {
  const pageTitle   = document.querySelector('#page-title');
  const editLink    = document.querySelector('#estate-edit-link');
  if (pageTitle) pageTitle.textContent = title;

  // Show "Edit" link only on dashboard
  if (editLink) editLink.style.display = (title === 'Dashboard') ? 'inline' : 'none';

  // Re-populate estate name (it may have been cleared by a page nav)
  fetch('/api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    .then(r => r.json())
    .then(d => updateEstateName(d.user?.estate?.name))
    .catch(() => {});
}

function updateDateTime() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const el = document.querySelector('#current-date-time');
  if (el) el.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())} • ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD HTML TEMPLATE
// ═══════════════════════════════════════════════════════════════

function getDashboardHTML() {
  return `
    <div class="stats-grid">
      <div class="card stat-card">
        <div class="icon-bg blue"><i class="ph ph-money"></i></div>
        <div><p class="stat-label">Total Collected</p><h2 class="stat-value" id="total-collected">KES 0</h2></div>
      </div>
      <div class="card stat-card">
        <div class="icon-bg red"><i class="ph ph-warning-circle"></i></div>
        <div><p class="stat-label">Total Overdue</p><h2 class="stat-value" id="total-overdue">KES 0</h2></div>
      </div>
      <div class="card stat-card">
        <div class="icon-bg green"><i class="ph ph-house"></i></div>
        <div><p class="stat-label">Units</p><h2 class="stat-value" id="total-units">0</h2></div>
      </div>
      <div class="card stat-card">
        <div class="icon-bg orange"><i class="ph ph-users"></i></div>
        <div><p class="stat-label">Residents</p><h2 class="stat-value" id="total-residents">0</h2></div>
      </div>
    </div>

    <div class="quick-actions">
      <h3>Quick Navigation</h3>
      <div class="action-buttons">
        <button class="btn btn-primary" onclick="loadPage('residents')"><i class="ph ph-user-plus"></i> Manage Residents</button>
        <button class="btn btn-primary" onclick="loadPage('invoices')"><i class="ph ph-stack"></i> Generate Invoice</button>
        <button class="btn btn-primary" onclick="loadPage('payments')"><i class="ph ph-currency-circle-dollar"></i> Record Payment</button>
        <button class="btn btn-primary" onclick="loadPage('collections')"><i class="ph ph-warning-circle"></i> View Overdue</button>
        <button class="btn btn-secondary" onclick="loadPage('reports')"><i class="ph ph-export"></i> Export Report</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Recent Payments</h2>
        <a href="#" onclick="loadPage('payments'); return false;" style="color:var(--primary);text-decoration:none;font-weight:600;">View All</a>
      </div>
      <div class="table-responsive">
        <table>
          <thead><tr><th>Resident</th><th>Unit</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th></tr></thead>
          <tbody id="payments-tbody"><tr><td colspan="6" style="text-align:center;padding:40px;">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Overdue Balances</h2>
        <a href="#" onclick="loadPage('collections'); return false;" style="color:var(--primary);text-decoration:none;font-weight:600;">View All</a>
      </div>
      <div class="table-responsive">
        <table>
          <thead><tr><th>Resident</th><th>Unit</th><th>Overdue Amount</th><th>Days Overdue</th><th>Status</th></tr></thead>
          <tbody id="overdue-tbody"><tr><td colspan="5" style="text-align:center;padding:40px;">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD DATA 
// ═══════════════════════════════════════════════════════════════

async function loadDashboardData() {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const safeJson = async (res, key) => {
      if (!res.ok) return [];
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return [];
      const data = await res.json();
      return data[key] || [];
    };

    const [paymentsRes, invoicesRes, tenantsRes, unitsRes] = await Promise.all([
      fetch('/api/payments', { headers }),
      fetch('/api/invoices', { headers }),
      fetch('/api/tenants', { headers }),
      fetch('/api/units', { headers }),
    ]);

    const payments = await safeJson(paymentsRes, 'payments');
    const invoices = await safeJson(invoicesRes, 'invoices');
    const tenants  = await safeJson(tenantsRes,  'tenants');
    const units    = await safeJson(unitsRes,    'units');

    renderRecentPayments(payments);
    renderOverdueInvoices(invoices);
    updateDashboardStats(payments, invoices, tenants, units);

  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderRecentPayments(payments) {
  const tbody = document.querySelector('#payments-tbody');
  if (!tbody) return;

  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8;">No payments recorded yet</td></tr>';
    return;
  }

  tbody.innerHTML = payments.slice(0, 5).map(p => `
    <tr>
      <td>${p.residentName || 'N/A'}</td>
      <td>${p.unitNumber || 'N/A'}</td>
      <td>${formatCurrency(p.amountPaid || p.amount || 0)}</td>
      <td>${p.method || p.paymentMethod || 'N/A'}</td>
      <td>${formatDate(p.paymentDate)}</td>
      <td><span class="badge badge-success">Paid</span></td>
    </tr>
  `).join('');
}

function renderOverdueInvoices(invoices) {
  const tbody = document.querySelector('#overdue-tbody');
  if (!tbody) return;

  const now = new Date();
  const overdue = invoices.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE').slice(0, 5);

  if (!overdue.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8;">No overdue balances</td></tr>';
    return;
  }

  tbody.innerHTML = overdue.map(inv => {
    const days = Math.max(0, Math.floor((now - new Date(inv.dueDate)) / 86400000));
    return `
      <tr>
        <td>${inv.residentName || 'N/A'}</td>
        <td>${inv.unitNumber || 'N/A'}</td>
        <td>${formatCurrency(inv.amount || 0)}</td>
        <td>${days}</td>
        <td><span class="badge badge-danger">Overdue</span></td>
      </tr>
    `;
  }).join('');
}

function updateDashboardStats(payments, invoices, tenants, units) {
  const totalCollected = payments.reduce((s, p) => s + parseFloat(p.amountPaid || p.amount || 0), 0);
  const totalOverdue   = invoices
    .filter(i => i.status === 'PENDING' || i.status === 'OVERDUE')
    .reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const el = id => document.querySelector(`#${id}`);
  if (el('total-collected')) el('total-collected').textContent = formatCurrency(totalCollected);
  if (el('total-overdue'))   el('total-overdue').textContent   = formatCurrency(totalOverdue);
  if (el('total-units'))     el('total-units').textContent     = units.length;
  if (el('total-residents')) el('total-residents').textContent = tenants.filter(t => t.isActive !== false).length;
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login.html'; return null; }

  try {
    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
    });
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login.html'; return null; }
    return res;
  } catch (err) {
    console.error('API error:', err);
    showNotification('Network error', 'error');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function showNotification(message, type = 'success', duration = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => { el.style.animation = 'slideOut 0.3s ease'; setTimeout(() => el.remove(), 300); }, duration);
}