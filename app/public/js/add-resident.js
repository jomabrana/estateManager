// ═══════════════════════════════════════════════════════════════
// ADD RESIDENT PAGE - Form handling and submission (FIXED)
// Page: /add-resident.html
// 
// FIXED: Now properly handles assignment to existing vacant units
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  const user = await ensureLoggedIn();
  if (!user) return;

  loadUserProfile(user);
  updateDateTime();
  setInterval(updateDateTime, 60000);

  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Build the unit field (dropdown or text input) before anything else
  await initUnitField();

  const form = document.querySelector('#add-resident-form');
  if (form) form.addEventListener('submit', handleSaveResident);
});

// ═══════════════════════════════════════════════════════════════
// UNIT FIELD INITIALISATION
// ═══════════════════════════════════════════════════════════════

// Stores the resolved unit for submission
let _lockedUnit = null;     // { id, unitNumber, monthlyCharge } — set when arriving from vacant row
let _selectedUnitId = null; // NEW: stores selected unit ID from dropdown

async function initUnitField() {
  const params     = new URLSearchParams(window.location.search);
  const unitId     = params.get('unitId');
  const unitNumber = params.get('unitNumber');
  const charge     = params.get('charge');

  // ── Case 1: Arriving from a vacant-row click — pre-fill & lock ──
  if (unitId && unitNumber) {
    _lockedUnit = { id: parseInt(unitId), unitNumber, monthlyCharge: parseFloat(charge) || 0 };
    renderLockedUnitField(unitNumber, parseFloat(charge) || 0);
    return;
  }

  // ── Case 2: Normal "Add Resident" flow — fetch vacant units ──
  try {
    const token = localStorage.getItem('token');
    const [tenantsRes, unitsRes] = await Promise.all([
      fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/units',   { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const tenantsData = await tenantsRes.json();
    const unitsData   = await unitsRes.json();

    const allResidents = tenantsData.tenants || [];
    const allUnits     = unitsData.units     || [];

    const occupiedUnitIds = new Set(
      allResidents.filter(r => r.isActive !== false).map(r => r.unit?.id).filter(Boolean)
    );
    const vacantUnits = allUnits.filter(u => !occupiedUnitIds.has(u.id));

    if (vacantUnits.length > 0) {
      renderVacantDropdown(vacantUnits);
    } else {
      renderFreeTextUnitField();
    }
  } catch (err) {
    // Fall back to free-text on error
    renderFreeTextUnitField();
  }
}

// Renders a locked read-only display when coming from a vacant row
function renderLockedUnitField(unitNumber, charge) {
  const wrapper = document.getElementById('unit-field-wrapper');
  if (!wrapper) return;

  const formattedCharge = new Intl.NumberFormat('en-KE', {
    style: 'currency', currency: 'KES', minimumFractionDigits: 0
  }).format(charge);

  wrapper.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>Unit Number</label>
        <div class="locked-field">
          <span class="unit-chip">${unitNumber}</span>
          <span class="locked-hint"><i class="ph ph-lock-simple"></i> Pre-selected</span>
        </div>
        <!-- Hidden inputs so form submission can still read them -->
        <input type="hidden" id="f-unit-number" value="${unitNumber}">
      </div>
      <div class="form-group">
        <label>Monthly Charge (KES)</label>
        <div class="locked-field">
          <span>${formattedCharge}</span>
          <span class="locked-hint"><i class="ph ph-lock-simple"></i> Pre-filled</span>
        </div>
        <input type="hidden" id="f-monthly-charge" value="${charge}">
      </div>
    </div>`;
}

// Renders a dropdown of vacant units; selecting one auto-fills the charge
function renderVacantDropdown(vacantUnits) {
  const wrapper = document.getElementById('unit-field-wrapper');
  if (!wrapper) return;

  const options = vacantUnits.map(u => {
    const charge = new Intl.NumberFormat('en-KE', {
      style: 'currency', currency: 'KES', minimumFractionDigits: 0
    }).format(u.monthlyCharge || 0);
    return `<option value="${u.unitNumber}" data-id="${u.id}" data-charge="${u.monthlyCharge || 0}">${u.unitNumber} — ${charge}/mo</option>`;
  }).join('');

  wrapper.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>Unit Number * <span class="field-hint">Showing vacant units only</span></label>
        <select id="f-unit-number" required onchange="onVacantUnitChange(this)">
          <option value="">Select a vacant unit...</option>
          ${options}
        </select>
      </div>
      <div class="form-group">
        <label>Monthly Charge (KES)</label>
        <div class="charge-display" id="charge-display">
          <span id="charge-display-text">— Select a unit above</span>
        </div>
        <input type="hidden" id="f-monthly-charge" value="0">
      </div>
    </div>`;
}

// Renders plain text inputs when there are no vacant units (brand new unit)
function renderFreeTextUnitField() {
  const wrapper = document.getElementById('unit-field-wrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>Unit Number *</label>
        <input type="text" id="f-unit-number" placeholder="e.g. A-01" required>
      </div>
      <div class="form-group">
        <label>Monthly Charge (KES) *</label>
        <input type="number" id="f-monthly-charge" placeholder="e.g. 15000" min="0" required>
      </div>
    </div>`;
}

// FIXED: Called when the vacant-units dropdown changes
// Now extracts AND STORES the unit ID for submission
function onVacantUnitChange(select) {
  const selected = select.options[select.selectedIndex];
  const charge   = parseFloat(selected.dataset.charge) || 0;
  
  // NEW: Extract and store the unit ID
  _selectedUnitId = selected.dataset.id ? parseInt(selected.dataset.id) : null;

  document.getElementById('f-monthly-charge').value = charge;

  const displayText = document.getElementById('charge-display-text');
  if (displayText) {
    const formatted = new Intl.NumberFormat('en-KE', {
      style: 'currency', currency: 'KES', minimumFractionDigits: 0
    }).format(charge);
    displayText.textContent = selected.value ? `${formatted} / month` : '— Select a unit above';
  }
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
}

function removeField(button) {
  button.parentElement.remove();
}

// ═══════════════════════════════════════════════════════════════
// FORM SUBMISSION (FIXED)
// ═══════════════════════════════════════════════════════════════

async function handleSaveResident(e) {
  e.preventDefault();

  const errorEl = document.querySelector('#form-error');
  errorEl.style.display = 'none';

  const unitNumber    = document.querySelector('#f-unit-number')?.value?.trim();
  const monthlyCharge = parseFloat(document.querySelector('#f-monthly-charge')?.value) || 0;
  const fullName      = document.querySelector('#f-full-name').value.trim();
  const type          = document.querySelector('#f-type').value;
  const moveInDate    = document.querySelector('#f-move-in').value;
  const isActive      = document.querySelector('#f-is-active').value === 'true';
  const notes         = document.querySelector('#f-notes').value.trim();

  const emails = Array.from(document.querySelectorAll('.email-field'))
    .map(el => el.value.trim()).filter(Boolean);
  const phones = Array.from(document.querySelectorAll('.phone-field'))
    .map(el => el.value.trim()).filter(Boolean);

  // ── VALIDATION ────────────────────────────────────────────────
  if (!unitNumber) { showError('Unit number is required'); return; }
  if (!fullName)   { showError('Resident name is required'); return; }
  if (!type)       { showError('Occupancy type is required'); return; }
  if (!moveInDate) { showError('Move-in date is required'); return; }
  if (monthlyCharge <= 0) { showError('Monthly charge must be greater than 0'); return; }

  // ── SUBMIT ────────────────────────────────────────────────────
  try {
    const token = localStorage.getItem('token');
    const btn   = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled  = true;
    btn.innerHTML = '<i class="ph ph-spinner"></i> Saving...';

    // FIXED: Build payload with unitId when available
    const payload = {
      fullName,
      emails,
      phones,
      type,
      moveInDate,
      notes,
      isActive
    };

    // Include unitId if we have one (from locked unit or selected from dropdown)
    const unitId = _lockedUnit?.id || _selectedUnitId;
    if (unitId) {
      payload.unitId = unitId;
    } else {
      // Only include unitNumber and monthlyCharge when creating a brand-new unit
      payload.unitNumber = unitNumber;
      payload.monthlyCharge = monthlyCharge;
    }

    const response = await fetch('/api/tenants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = await response.json();
      showError(data.error || 'Failed to create resident');
      btn.disabled  = false;
      btn.innerHTML = originalText;
      return;
    }

    showNotification('Resident created successfully!', 'success');
    setTimeout(() => { window.location.href = '/?page=residents'; }, 1500);

  } catch (error) {
    console.error('Error:', error);
    showError('Network error. Please try again.');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled  = false;
    btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Save Resident';
  }
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════

function showError(message) {
  const errorEl = document.querySelector('#form-error');
  errorEl.textContent    = message;
  errorEl.style.display  = 'block';
  window.scrollTo(0, 0);
}

function goBack() {
  window.location.href = '/residents.html';
}