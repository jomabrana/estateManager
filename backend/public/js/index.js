// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await ensureLoggedIn();
  if (!ok) return;

  loadUserProfile();
  updateDateTime();
  setInterval(updateDateTime, 60000);

  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  loadDashboardData();
});

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION 
// ═══════════════════════════════════════════════════════════════

async function ensureLoggedIn() {
  const token = localStorage.getItem('token');
  if (!token) {
    if (!location.pathname.endsWith('login.html')) {
      window.location.href = '/login.html';
    }
    return false;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('not authenticated');
    return true;
  } catch (e) {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
    return false;
  }
}

async function loadUserProfile() {
  const token = localStorage.getItem('token');

  if (!token) {
    console.log('No token found. Redirecting to login...');
    window.location.href = '/login.html';
    return;
  }

  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    const data = await response.json();
    const user = data.user;

    // Update avatar
    const avatarElement = document.querySelector('#user-avatar');
    if (avatarElement && user.fullName) {
      const initials = user.fullName.split(' ').map(w => w[0].toUpperCase()).join('');
      avatarElement.textContent = initials;
    }

    // Update name
    const nameElement = document.querySelector('#user-name');
    if (nameElement) nameElement.textContent = user.fullName || 'User';

    // Update role
    const roleElement = document.querySelector('#user-role');
    if (roleElement) roleElement.textContent = user.role === 'admin' ? 'Admin' : 'Member';

    console.log('✅ User profile loaded:', user);

  } catch (err) {
    console.error('❌ Error loading user profile:', err);
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  }
}

function updateDateTime() {
  const now = new Date();
  
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  const date = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  
  const dateString = `${time} • ${date} ${month} ${year}`;
  
  const dateElement = document.querySelector('#current-date-time');
  if (dateElement) dateElement.textContent = dateString;
}

async function handleLogout() {
  const token = localStorage.getItem('token');

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('Logout error:', err);
  }

  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

// ═══════════════════════════════════════════════════════════════
// SPA PAGE LOADING
// ═══════════════════════════════════════════════════════════════

async function loadPage(pageName) {
  console.log(`📄 Loading page: ${pageName}`);
  
  if (window.isLoading) return;
  window.isLoading = true;
  
  try {
    setActiveNav(pageName);
    const container = document.getElementById('page-container');
    
    // Dashboard - show default content
    if (pageName === 'dashboard') {
      const dashboardContent = document.getElementById('dashboard-content');
      if (dashboardContent) {
        container.innerHTML = dashboardContent.innerHTML;
        loadDashboardData();
      }
      updatePageTitle('Dashboard', 'Overview of your estate');
      window.isLoading = false;
      window.scrollTo(0, 0);
      return;
    }
    
    // Fetch page HTML
    const response = await fetch(`/${pageName}.html`);
    if (!response.ok) throw new Error(`Failed to load ${pageName}.html`);
    
    const html = await response.text();
    container.innerHTML = html;
    
    // Update page title
    const pageNames = {
      residents: 'Residents & Units',
      invoices: 'Invoices',
      payments: 'Payments',
      collections: 'Collections',
      reports: 'Reports',
      communications: 'Communications',
      estate: 'Estate Settings'
    };
    
    updatePageTitle(pageNames[pageName] || pageName, '');
    
    // Load page-specific JS
    const script = document.createElement('script');
    script.src = `/js/${pageName}.js`;
    script.onload = () => {
      const fnName = `load${pageName.charAt(0).toUpperCase() + pageName.slice(1)}`;
      if (typeof window[fnName] === 'function') window[fnName]();
      window.isLoading = false;
    };
    script.onerror = () => {
      console.error(`Failed to load /page-js/${pageName}.js`);
      window.isLoading = false;
    };
    document.body.appendChild(script);
    window.scrollTo(0, 0);
    
  } catch (error) {
    console.error('Error loading page:', error);
    document.getElementById('page-container').innerHTML = `
      <div class="card" style="text-align: center; padding: 60px 40px;">
        <h2 style="color: #ef4444; margin-bottom: 16px;">⚠️ Error Loading Page</h2>
        <p style="color: #64748b;">${error.message}</p>
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
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  
  const activeLink = document.querySelector(`[data-page="${pageName}"]`);
  if (activeLink) activeLink.classList.add('active');
}

function updatePageTitle(title, subtitle) {
  const pageTitle = document.querySelector('#page-title');
  const pageSubtitle = document.querySelector('#page-subtitle');
  
  if (pageTitle) pageTitle.textContent = title;
  if (pageSubtitle) {
    if (subtitle) {
      pageSubtitle.innerHTML = subtitle;
    } else {
      pageSubtitle.innerHTML = `
        <span id="estate-name">Amani Estate</span>
        <a href="#" onclick="loadPage('estate'); return false;" style="margin-left: 8px; color: #2563eb; text-decoration: none; font-weight: 600;">Edit</a>
      `;
    }
  }
}




// ═══════════════════════════════════════════════════════════════
// DASHBOARD DATA
// ═══════════════════════════════════════════════════════════════

async function loadDashboardData() {
  try {
    const token = localStorage.getItem('token');
    
    // Payments
    const paymentsRes = await fetch('/api/payments', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (paymentsRes.ok) {
      const data = await paymentsRes.json();
      renderRecentPayments(data.payments || []);
    }
    
    // Invoices
    const invoicesRes = await fetch('/api/invoices', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (invoicesRes.ok) {
      const data = await invoicesRes.json();
      renderOverdueInvoices(data.invoices || []);
    }
    
    updateDashboardStats();
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

function renderRecentPayments(payments) {
  const tbody = document.querySelector('#payments-tbody');
  if (!tbody) return;
  
  if (!payments || !payments.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No payments</td></tr>';
    return;
  }
  
  tbody.innerHTML = payments.slice(0, 5).map(p => `
    <tr>
      <td>${p.residentName || 'N/A'}</td>
      <td>${p.unitNumber || 'N/A'}</td>
      <td>${formatCurrency(p.amount || 0)}</td>
      <td>${p.paymentMethod || 'N/A'}</td>
      <td>${formatDate(p.paymentDate)}</td>
      <td><span class="badge badge-success">Paid</span></td>
    </tr>
  `).join('');
}

function renderOverdueInvoices(invoices) {
  const tbody = document.querySelector('#overdue-tbody');
  if (!tbody) return;
  
  const now = new Date();
  const overdue = (invoices || []).filter(i => i.status === 'PENDING' || i.status === 'OVERDUE').slice(0, 5);
  
  if (!overdue.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No overdue</td></tr>';
    return;
  }
  
  tbody.innerHTML = overdue.map(inv => {
    const daysOverdue = Math.floor((now - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
    return `
      <tr>
        <td>${inv.residentName || 'N/A'}</td>
        <td>${inv.unitNumber || 'N/A'}</td>
        <td>${formatCurrency(inv.amount || 0)}</td>
        <td>${Math.max(0, daysOverdue)}</td>
        <td><span class="badge badge-danger">Overdue</span></td>
      </tr>
    `;
  }).join('');
}

function updateDashboardStats() {
  const els = {
    collected: document.querySelector('#total-collected'),
    overdue: document.querySelector('#total-overdue'),
    units: document.querySelector('#total-units'),
    residents: document.querySelector('#total-residents')
  };
  
  if (els.collected) els.collected.textContent = formatCurrency(420000);
  if (els.overdue) els.overdue.textContent = formatCurrency(85000);
  if (els.units) els.units.textContent = '50';
  if (els.residents) els.residents.textContent = '47';
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-KE', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  try {
    const response = await fetch(`/api${endpoint}`, { ...options, headers });
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
      return null;
    }
    return response;
  } catch (err) {
    console.error('API error:', err);
    showNotification('Network error', 'error');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════

function openModal(modalId) {
  const modal = document.querySelector(`#${modalId}`);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.querySelector(`#${modalId}`);
  if (modal) modal.classList.remove('active');
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
  }
});

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function showNotification(message, type = 'success', duration = 3000) {
  const notif = document.createElement('div');
  const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b';
  notif.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 16px 24px; background: ${bg}; color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 2000; animation: slideIn 0.3s ease;`;
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, duration);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
`;
document.head.appendChild(style);