async function ensureLoggedIn() {
  const token = localStorage.getItem('token');
  if (!token) {
    // nothing to do on login page itself
    if (!location.pathname.endsWith('login.html')) {
      window.location.href = '/login.html';
    }
    return false;
  }

  // try to fetch /me – if it fails, the token is bad/expired
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

document.addEventListener('DOMContentLoaded', async () => {
  // block unauthorised access immediately
  const ok = await ensureLoggedIn();
  if (!ok) return;

  // rest of the initialisation only runs when logged in
  loadUserProfile();
  updateDateTime();
  setInterval(updateDateTime, 60000);

  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
});

// Fetch logged-in user and populate profile section
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

    // Update avatar with initials
    const avatarElement = document.querySelector('.avatar');
    if (avatarElement && user.fullName) {
      const initials = user.fullName
        .split(' ')
        .map(word => word[0].toUpperCase())
        .join('');
      avatarElement.textContent = initials;
    }

    // Update name
    const nameElement = document.querySelector('.user-info .name');
    if (nameElement) {
      nameElement.textContent = user.fullName || 'User';
    }

    // Update role
    const roleElement = document.querySelector('.user-info .role');
    if (roleElement) {
      const roleDisplay = user.role === 'admin' ? 'Admin' : 'Member';
      roleElement.textContent = roleDisplay;
    }

    console.log('✅ User profile loaded:', user);

  } catch (err) {
    console.error('❌ Error loading user profile:', err);
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  }
}

// Update date and time display
function updateDateTime() {
  const now = new Date();
  
  // Format time as HH:MM
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  // Format date as "D Month YYYY"
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayOfWeek = days[now.getDay()];
  const date = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  
  const dateString = `${time} • ${date} ${month} ${year}`;
  
  const dateElement = document.querySelector('#current-date-time');
  if (dateElement) {
    dateElement.textContent = dateString;
  }
}

// Handle logout
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

  // Clear token and redirect
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

// Add click listener to logout button
document.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();
  updateDateTime();
  
  // Update time every minute
  setInterval(updateDateTime, 60000);
  
  // Logout button click handler
  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
});