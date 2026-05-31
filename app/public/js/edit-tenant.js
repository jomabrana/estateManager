// ═══════════════════════════════════════════════════════════════
// EDIT RESIDENT PAGE - Form handling and submission
// Page: /edit-tenant.html?residentId=1
// ═══════════════════════════════════════════════════════════════

let _currentResidentId = null;
let _originalData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureLoggedIn();
  if (!user) return;

  loadUserProfile(user);
  updateDateTime();
  setInterval(updateDateTime, 60000);

  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Get resident ID from URL
  const params = new URLSearchParams(window.location.search);
  _currentResidentId = parseInt(params.get('residentId'));

  if (!_currentResidentId) {
    showError('Resident ID is missing. Cannot load resident.');
    return;
  }

  // Load resident data
  await loadResidentData();

  const form = document.querySelector('#edit-resident-form');
  if (form) form.addEventListener('submit', handleUpdateResident);
});

// ═══════════════════════════════════════════════════════════════
// LOAD RESIDENT DATA
// ═══════════════════════════════════════════════════════════════

async function loadResidentData() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/tenants/${_currentResidentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const error = await response.json();
      showError(error.error || 'Failed to load resident');
      return;
    }

    const data = await response.json();
    const resident = data.tenant;

    if (!resident) {
      showError('Resident not found');
      return;
    }

    _originalData = JSON.parse(JSON.stringify(resident));

    // Populate form with resident data
    populateForm(resident);

    // Update page subtitle
    const subtitle = document.querySelector('#form-subtitle');
    if (subtitle) {
      subtitle.textContent = `${resident.fullName} • Unit ${resident.unit.unitNumber}`;
    }

  } catch (err) {
    console.error('Error loading resident:', err);
    showError('Network error. Please try again.');
  }
}

// Populate form fields with resident data
function populateForm(resident) {
  const { unit, fullName, type, moveInDate, isActive, notes, emails, phones } = resident;

  // Unit details
  document.querySelector('#f-unit-number').value = unit.unitNumber || '';
  document.querySelector('#f-monthly-charge').value = unit.monthlyCharge || 0;

  // Resident details
  document.querySelector('#f-full-name').value = fullName || '';
  document.querySelector('#f-type').value = type || '';
  document.querySelector('#f-is-active').value = isActive !== false ? 'true' : 'false';

  // Move-in date (convert to YYYY-MM-DD format)
  if (moveInDate) {
    const date = new Date(moveInDate);
    const formatted = date.toISOString().split('T')[0];
    document.querySelector('#f-move-in').value = formatted;
  }

  // Notes
  document.querySelector('#f-notes').value = notes || '';

  // Populate emails
  const emailsContainer = document.querySelector('#emails-container');
  emailsContainer.innerHTML = '';
  if (emails && emails.length > 0) {
    emails.forEach((email, idx) => {
      if (idx === 0) {
        // First email in existing row
        emailsContainer.innerHTML = `
          <div class="multi-field-row">
            <input type="email" placeholder="e.g. jane@example.com" class="email-field" value="${email}">
            <button type="button" class="btn-remove-field" onclick="removeField(this)">
              <i class="ph ph-trash"></i>
            </button>
          </div>`;
      } else {
        // Additional emails
        const row = document.createElement('div');
        row.className = 'multi-field-row';
        row.innerHTML = `
          <input type="email" placeholder="e.g. jane@example.com" class="email-field" value="${email}">
          <button type="button" class="btn-remove-field" onclick="removeField(this)">
            <i class="ph ph-trash"></i>
          </button>`;
        emailsContainer.appendChild(row);
      }
    });
  } else {
    emailsContainer.innerHTML = `
      <div class="multi-field-row">
        <input type="email" placeholder="e.g. jane@example.com" class="email-field">
        <button type="button" class="btn-remove-field" onclick="removeField(this)" style="display:none;">
          <i class="ph ph-trash"></i>
        </button>
      </div>`;
  }

  // Populate phones
  const phonesContainer = document.querySelector('#phones-container');
  phonesContainer.innerHTML = '';
  if (phones && phones.length > 0) {
    phones.forEach((phone, idx) => {
      if (idx === 0) {
        // First phone in existing row
        phonesContainer.innerHTML = `
          <div class="multi-field-row">
            <input type="tel" placeholder="e.g. +254700000000" class="phone-field" value="${phone}">
            <button type="button" class="btn-remove-field" onclick="removeField(this)">
              <i class="ph ph-trash"></i>
            </button>
          </div>`;
      } else {
        // Additional phones
        const row = document.createElement('div');
        row.className = 'multi-field-row';
        row.innerHTML = `
          <input type="tel" placeholder="e.g. +254700000000" class="phone-field" value="${phone}">
          <button type="button" class="btn-remove-field" onclick="removeField(this)">
            <i class="ph ph-trash"></i>
          </button>`;
        phonesContainer.appendChild(row);
      }
    });
  } else {
    phonesContainer.innerHTML = `
      <div class="multi-field-row">
        <input type="tel" placeholder="e.g. +254700000000" class="phone-field">
        <button type="button" class="btn-remove-field" onclick="removeField(this)" style="display:none;">
          <i class="ph ph-trash"></i>
        </button>
      </div>`;
  }

  // Update remove button visibility
  updateRemoveButtonsVisibility();
}

// ═══════════════════════════════════════════════════════════════
// FORM FIELD MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function addEmailField() {
  const container = document.querySelector('#emails-container');
  const row = document.createElement('div');
  row.className = 'multi-field-row';
  row.innerHTML = `
    <input type="email" placeholder="e.g. jane@example.com" class="email-field">
    <button type="button" class="btn-remove-field" onclick="removeField(this)">
      <i class="ph ph-trash"></i>
    </button>`;
  container.appendChild(row);
  updateRemoveButtonsVisibility();
}

function addPhoneField() {
  const container = document.querySelector('#phones-container');
  const row = document.createElement('div');
  row.className = 'multi-field-row';
  row.innerHTML = `
    <input type="tel" placeholder="e.g. +254700000000" class="phone-field">
    <button type="button" class="btn-remove-field" onclick="removeField(this)">
      <i class="ph ph-trash"></i>
    </button>`;
  container.appendChild(row);
  updateRemoveButtonsVisibility();
}

function removeField(button) {
  button.parentElement.remove();
  updateRemoveButtonsVisibility();
}

function updateRemoveButtonsVisibility() {
  // Show remove buttons only if there are 2+ fields
  const emailRows = document.querySelectorAll('#emails-container .multi-field-row');
  const phoneRows = document.querySelectorAll('#phones-container .multi-field-row');

  emailRows.forEach(row => {
    const btn = row.querySelector('.btn-remove-field');
    if (btn) btn.style.display = emailRows.length > 1 ? 'block' : 'none';
  });

  phoneRows.forEach(row => {
    const btn = row.querySelector('.btn-remove-field');
    if (btn) btn.style.display = phoneRows.length > 1 ? 'block' : 'none';
  });
}

// ═══════════════════════════════════════════════════════════════
// FORM SUBMISSION
// ═══════════════════════════════════════════════════════════════

async function handleUpdateResident(e) {
  e.preventDefault();

  const errorEl = document.querySelector('#form-error');
  errorEl.style.display = 'none';

  // Collect form data
  const unitNumber = document.querySelector('#f-unit-number').value.trim();
  const monthlyCharge = parseFloat(document.querySelector('#f-monthly-charge').value) || 0;
  const fullName = document.querySelector('#f-full-name').value.trim();
  const type = document.querySelector('#f-type').value;
  const moveInDate = document.querySelector('#f-move-in').value;
  const isActive = document.querySelector('#f-is-active').value === 'true';
  const notes = document.querySelector('#f-notes').value.trim();

  const emails = Array.from(document.querySelectorAll('.email-field'))
    .map(el => el.value.trim()).filter(Boolean);
  const phones = Array.from(document.querySelectorAll('.phone-field'))
    .map(el => el.value.trim()).filter(Boolean);

  // ── VALIDATION ────────────────────────────────────────────────
  if (!unitNumber) { showError('Unit number is required'); return; }
  if (!fullName) { showError('Resident name is required'); return; }
  if (!type) { showError('Occupancy type is required'); return; }
  if (!moveInDate) { showError('Move-in date is required'); return; }
  if (monthlyCharge <= 0) { showError('Monthly charge must be greater than 0'); return; }

  // ── SUBMIT ────────────────────────────────────────────────────
  try {
    const token = localStorage.getItem('token');
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner"></i> Saving...';

    const payload = {
      fullName,
      emails,
      phones,
      type,
      moveInDate,
      notes,
      isActive,
      unitNumber,
      monthlyCharge
    };

    const response = await fetch(`/api/tenants/${_currentResidentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = await response.json();
      showError(data.error || 'Failed to update resident');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    showNotification('Resident updated successfully!', 'success');
    setTimeout(() => { window.location.href = '/?page=residents'; }, 1500);

  } catch (error) {
    console.error('Error:', error);
    showError('Network error. Please try again.');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Save Changes';
  }
}

// ═══════════════════════════════════════════════════════════════
// DELETE RESIDENT
// ═══════════════════════════════════════════════════════════════

async function handleDeleteResident() {
  const confirmDelete = confirm(
    `Are you sure you want to delete ${_originalData?.fullName}?\n\nThis action cannot be undone.`
  );

  if (!confirmDelete) return;

  try {
    const token = localStorage.getItem('token');
    const btn = document.querySelector('#delete-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner"></i> Deleting...';

    const response = await fetch(`/api/tenants/${_currentResidentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const data = await response.json();
      showError(data.error || 'Failed to delete resident');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    showNotification('Resident deleted successfully!', 'success');
    setTimeout(() => { window.location.href = '/?page=residents'; }, 1500);

  } catch (error) {
    console.error('Error:', error);
    showError('Network error. Please try again.');
    const btn = document.querySelector('#delete-btn');
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-trash"></i> Delete Resident';
  }
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════

function showError(message) {
  const errorEl = document.querySelector('#form-error');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  window.scrollTo(0, 0);
}