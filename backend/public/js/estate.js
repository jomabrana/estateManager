// public/js/estate.js
// Loaded dynamically by index.js when user navigates to Estate Settings

let currentEstate = null;

async function loadEstate() {
  const token = localStorage.getItem('token');
  const loadingEl = document.getElementById('estate-loading');
  const formEl    = document.getElementById('estate-form');
  const dangerEl  = document.getElementById('danger-zone');

  try {
    // Get user to find their estateId
    const meRes = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { user } = await meRes.json();

    if (!user.estateId) {
      loadingEl.innerHTML = '<p style="color:var(--danger)">No estate linked to your account.</p>';
      return;
    }

    // Fetch estate details
    const estateRes = await fetch(`/api/estates/${user.estateId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { estate } = await estateRes.json();
    currentEstate = estate;

    // Populate form
    document.getElementById('estate-name-input').value        = estate.name        || '';
    document.getElementById('estate-location-input').value    = estate.location    || '';
    document.getElementById('estate-units-input').value       = estate.numberOfUnits ?? '';
    document.getElementById('estate-description-input').value = estate.description || '';
    document.getElementById('estate-id-badge').textContent    = `ID: ${estate.id}`;

    // Show form + danger zone
    loadingEl.style.display = 'none';
    formEl.style.display    = 'block';
    dangerEl.style.display  = 'block';

    // Set the confirmation phrase using estate name
    setConfirmPhrase(estate.name);

    // Wire up form submit
    formEl.addEventListener('submit', handleSave);

  } catch (err) {
    console.error('Load estate error:', err);
    loadingEl.innerHTML = '<p style="color:var(--danger)">Failed to load estate details.</p>';
  }
}

// ── SAVE ──────────────────────────────────────────────────────

async function handleSave(e) {
  e.preventDefault();
  const token  = localStorage.getItem('token');
  const errEl  = document.getElementById('form-error');
  const saveBtn = document.getElementById('save-btn');

  errEl.style.display = 'none';
  saveBtn.disabled    = true;
  saveBtn.innerHTML   = '<i class="ph ph-spinner"></i> Saving...';

  const name         = document.getElementById('estate-name-input').value.trim();
  const location     = document.getElementById('estate-location-input').value.trim();
  const numberOfUnits= document.getElementById('estate-units-input').value;
  const description  = document.getElementById('estate-description-input').value.trim();

  if (!name || !location) {
    errEl.textContent    = 'Estate name and location are required.';
    errEl.style.display  = 'block';
    saveBtn.disabled     = false;
    saveBtn.innerHTML    = '<i class="ph ph-floppy-disk"></i> Save Changes';
    return;
  }

  try {
    const res = await fetch(`/api/estates/${currentEstate.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, location, numberOfUnits: numberOfUnits ? parseInt(numberOfUnits) : 0, description })
    });

    const data = await res.json();

    if (!res.ok) {
      errEl.textContent   = data.error || 'Failed to save changes.';
      errEl.style.display = 'block';
    } else {
      currentEstate = data.estate;
      setConfirmPhrase(data.estate.name);
      if (typeof showNotification === 'function') showNotification('Estate updated successfully', 'success');
      // Refresh estate name in header
      document.querySelectorAll('#estate-name').forEach(el => el.textContent = data.estate.name);
    }
  } catch (err) {
    errEl.textContent   = 'Network error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    saveBtn.disabled  = false;
    saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Save Changes';
  }
}

// ── DELETE MODAL ──────────────────────────────────────────────

function setConfirmPhrase(estateName) {
  const safe = (estateName || 'myestate').toLowerCase().replace(/\s+/g, '');
  const phrase = `i confirm i want to delete ${safe} from the database and all its associated data including tenants and payments`;
  document.getElementById('confirm-phrase-text').textContent = phrase;
  // Store on element for easy retrieval
  document.getElementById('confirm-phrase-text').dataset.phrase = phrase;
}

function openDeleteModal() {
  document.getElementById('delete-step-1').style.display = 'block';
  document.getElementById('delete-step-2').style.display = 'none';
  document.getElementById('confirm-phrase-input').value  = '';
  document.getElementById('delete-password').value       = '';
  document.getElementById('step1-error').style.display   = 'none';
  document.getElementById('step2-error').style.display   = 'none';
  document.getElementById('step1-next-btn').disabled     = true;
  document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('active');
}

function checkPhrase() {
  const input    = document.getElementById('confirm-phrase-input').value;
  const expected = document.getElementById('confirm-phrase-text').dataset.phrase;
  document.getElementById('step1-next-btn').disabled = (input !== expected);
}

function goToStep2() {
  document.getElementById('delete-step-1').style.display = 'none';
  document.getElementById('delete-step-2').style.display = 'block';
  document.getElementById('delete-password').focus();
}

function goBackToStep1() {
  document.getElementById('delete-step-2').style.display = 'none';
  document.getElementById('delete-step-1').style.display = 'block';
}

async function confirmDelete() {
  const token    = localStorage.getItem('token');
  const password = document.getElementById('delete-password').value;
  const errEl    = document.getElementById('step2-error');
  const btn      = document.getElementById('delete-confirm-btn');

  errEl.style.display = 'none';

  if (!password) {
    errEl.textContent   = 'Please enter your password.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled   = true;
  btn.textContent = 'Deleting...';

  try {
    // Step 1: verify password by attempting login with current user's email
    const meRes  = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    const { user } = await meRes.json();

    const verifyRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password })
    });

    if (!verifyRes.ok) {
      errEl.textContent   = 'Incorrect password. Deletion cancelled.';
      errEl.style.display = 'block';
      btn.disabled        = false;
      btn.innerHTML       = '<i class="ph ph-trash"></i> Delete Forever';
      return;
    }

    // Step 2: delete estate
    const delRes = await fetch(`/api/estates/${currentEstate.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!delRes.ok) {
      const d = await delRes.json();
      errEl.textContent   = d.error || 'Failed to delete estate.';
      errEl.style.display = 'block';
      btn.disabled        = false;
      btn.innerHTML       = '<i class="ph ph-trash"></i> Delete Forever';
      return;
    }

    // Unlink user from estate locally then redirect
    localStorage.removeItem('token');
    window.location.href = '/login.html';

  } catch (err) {
    errEl.textContent   = 'Network error. Please try again.';
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.innerHTML       = '<i class="ph ph-trash"></i> Delete Forever';
  }
}

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.id === 'delete-modal') closeDeleteModal();
});