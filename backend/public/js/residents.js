// public/js/residents.js

let allResidents = [];
let allUnits     = [];
let estateMax    = 0;
let editingResidentId = null;

// ── INIT ──────────────────────────────────────────────────────

async function loadResidents() {
  await fetchResidents();
}

async function fetchResidents() {
  const token = localStorage.getItem('token');
  const tbody = document.getElementById('residents-tbody');

  try {
    const [tenantsRes, unitsRes] = await Promise.all([
      fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/units',   { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const tenantsData = await tenantsRes.json();
    const unitsData   = await unitsRes.json();

    if (!tenantsRes.ok) throw new Error(tenantsData.error || 'Failed to load residents');
    if (!unitsRes.ok)   throw new Error(unitsData.error   || 'Failed to load units');

    allResidents = tenantsData.tenants || [];
    allUnits     = unitsData.units     || [];
    estateMax    = unitsData.estateNumberOfUnits || 0;

    renderResidents(allResidents);
    updateCounters(allResidents, allUnits, estateMax);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading" style="color:var(--danger)">${err.message}</td></tr>`;
  }
}

// ── COUNTERS ──────────────────────────────────────────────────

function updateCounters(residents, units, estateMax) {
  const active   = residents.filter(r => r.isActive !== false).length;
  const inactive = residents.filter(r => r.isActive === false).length;

  // Vacant = units that have no active residents
  const occupiedUnitIds = new Set(
    residents.filter(r => r.isActive !== false).map(r => r.unit?.id).filter(Boolean)
  );
  const vacant = units.filter(u => !occupiedUnitIds.has(u.id)).length;

  const unitEl    = document.getElementById('counter-units');
  const unitOfEl  = document.getElementById('counter-units-of');
  const activeEl  = document.getElementById('counter-residents');
  const inactiveEl= document.getElementById('counter-inactive');
  const vacantEl  = document.getElementById('counter-vacant');

  if (unitEl)     unitEl.textContent     = units.length;
  if (unitOfEl) {
    unitOfEl.textContent = estateMax > 0 ? ` / ${estateMax}` : '';
    // Highlight if over planned capacity
    if (unitOfEl.parentElement) {
      unitOfEl.parentElement.style.color = (units.length > estateMax && estateMax > 0) ? 'var(--warning)' : '';
    }
  }
  if (activeEl)   activeEl.textContent   = active;
  if (inactiveEl) inactiveEl.textContent = inactive;
  if (vacantEl)   vacantEl.textContent   = vacant;
}

// ── RENDER ────────────────────────────────────────────────────

function renderResidents(list) {
  const tbody = document.getElementById('residents-tbody');
  const countEl = document.getElementById('resident-count');

  if (countEl) countEl.textContent = `${list.length} resident${list.length !== 1 ? 's' : ''}`;

  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="8" class="table-empty">
        <div class="empty-state">
          <div class="empty-state-icon"><i class="ph ph-users"></i></div>
          <div class="empty-state-title">No residents yet</div>
          <p>Click "Add Resident" to get started.</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(r => {
    const emails = (r.emails || []).join(', ') || '—';
    const phones = (r.phones || []).join(', ') || '—';
    const charge = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(r.unit?.monthlyCharge || 0);
    const typeBadge = typeLabel(r.type);
    const statusBadge = r.isActive
      ? '<span class="badge badge-success">Active</span>'
      : '<span class="badge badge-warning">Inactive</span>';

    return `
      <tr>
        <td><span class="unit-chip">${r.unit?.unitNumber || '—'}</span></td>
        <td><strong>${r.fullName}</strong></td>
        <td>${typeBadge}</td>
        <td class="contact-cell">${emails}</td>
        <td class="contact-cell">${phones}</td>
        <td>${charge}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="openEditModal(${r.id})"><i class="ph ph-pencil-simple"></i></button>
            <button title="Delete" class="delete" onclick="openDeleteModal(${r.id}, '${r.fullName.replace(/'/g, "\\'")}', '${r.unit?.unitNumber || ''}')">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function typeLabel(type) {
  const map = {
    OWNER_OCCUPIER: '<span class="badge badge-info">Owner</span>',
    DIRECT_TENANT:  '<span class="badge badge-success">Direct Tenant</span>',
    MANAGED_TENANT: '<span class="badge badge-warning">Managed</span>',
    ABSENTEE_OWNER: '<span class="badge badge-info">Absentee</span>'
  };
  return map[type] || type;
}

// ── SEARCH / FILTER ───────────────────────────────────────────

function filterResidents(query) {
  const q = query.toLowerCase();
  const filtered = allResidents.filter(r =>
    r.fullName.toLowerCase().includes(q) ||
    (r.unit?.unitNumber || '').toLowerCase().includes(q) ||
    (r.emails || []).some(e => e.toLowerCase().includes(q)) ||
    (r.phones || []).some(p => p.includes(q))
  );
  renderResidents(filtered);
}

// ── ADD MODAL ─────────────────────────────────────────────────

function openAddModal() {
  editingResidentId = null;
  document.getElementById('modal-title').textContent = 'Add Resident';
  document.getElementById('modal-save-btn').innerHTML = '<i class="ph ph-floppy-disk"></i> Save Resident';
  clearForm();
  addEmailField('');
  addPhoneField('');
  document.getElementById('resident-modal').classList.add('active');
}

// ── EDIT MODAL ────────────────────────────────────────────────

async function openEditModal(residentId) {
  const token = localStorage.getItem('token');
  editingResidentId = residentId;

  document.getElementById('modal-title').textContent = 'Edit Resident';
  document.getElementById('modal-save-btn').innerHTML = '<i class="ph ph-floppy-disk"></i> Update Resident';
  clearForm();
  document.getElementById('resident-modal').classList.add('active');

  try {
    const res = await fetch(`/api/tenants/${residentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const r = data.tenant;

    document.getElementById('f-unit-number').value    = r.unit?.unitNumber || '';
    document.getElementById('f-monthly-charge').value = r.unit?.monthlyCharge || '';
    document.getElementById('f-full-name').value       = r.fullName || '';
    document.getElementById('f-type').value            = r.type || 'OWNER_OCCUPIER';
    document.getElementById('f-move-in').value         = r.moveInDate ? r.moveInDate.split('T')[0] : '';
    document.getElementById('f-is-active').value       = String(r.isActive);
    document.getElementById('f-notes').value           = r.notes || '';

    // Populate dynamic fields
    (r.emails?.length ? r.emails : ['']).forEach(e => addEmailField(e));
    (r.phones?.length ? r.phones : ['']).forEach(p => addPhoneField(p));

  } catch (err) {
    showError('modal-error', 'Failed to load resident: ' + err.message);
  }
}

function closeResidentModal() {
  document.getElementById('resident-modal').classList.remove('active');
  clearForm();
}

// ── SAVE ──────────────────────────────────────────────────────

async function saveResident() {
  const token = localStorage.getItem('token');
  const btn   = document.getElementById('modal-save-btn');

  hideError('modal-error');

  const unitNumber    = document.getElementById('f-unit-number').value.trim();
  const monthlyCharge = document.getElementById('f-monthly-charge').value;
  const fullName      = document.getElementById('f-full-name').value.trim();
  const type          = document.getElementById('f-type').value;
  const moveInDate    = document.getElementById('f-move-in').value;
  const isActive      = document.getElementById('f-is-active').value === 'true';
  const notes         = document.getElementById('f-notes').value.trim();

  const emails = [...document.querySelectorAll('.email-input')].map(i => i.value.trim()).filter(Boolean);
  const phones = [...document.querySelectorAll('.phone-input')].map(i => i.value.trim()).filter(Boolean);

  if (!unitNumber || !monthlyCharge || !fullName || !type || !moveInDate) {
    showError('modal-error', 'Unit number, monthly charge, full name, type and move-in date are required.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Saving...';

  try {
    const isEdit = editingResidentId !== null;
    const url    = isEdit ? `/api/tenants/${editingResidentId}` : '/api/tenants';
    const method = isEdit ? 'PUT' : 'POST';

    const body = { unitNumber, monthlyCharge: parseFloat(monthlyCharge), fullName, emails, phones, type, moveInDate, notes, isActive };

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    closeResidentModal();
    await fetchResidents();
    if (typeof showNotification === 'function')
      showNotification(isEdit ? 'Resident updated' : 'Resident added', 'success');

  } catch (err) {
    showError('modal-error', err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-floppy-disk"></i> ' + (editingResidentId ? 'Update Resident' : 'Save Resident');
  }
}

// ── DELETE ────────────────────────────────────────────────────

let deletingResidentId = null;

function openDeleteModal(id, name, unitNumber) {
  deletingResidentId = id;
  document.getElementById('delete-resident-name').textContent = name;
  document.getElementById('delete-unit-label').textContent    = unitNumber;
  document.getElementById('delete-unit-checkbox').checked     = false;
  document.getElementById('delete-resident-modal').classList.add('active');
}

async function confirmDeleteResident() {
  const token       = localStorage.getItem('token');
  const deleteUnit  = document.getElementById('delete-unit-checkbox').checked;

  try {
    const res = await fetch(`/api/tenants/${deletingResidentId}?deleteUnit=${deleteUnit}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');

    closeModal('delete-resident-modal');
    await fetchResidents();
    if (typeof showNotification === 'function')
      showNotification('Resident deleted', 'success');
  } catch (err) {
    if (typeof showNotification === 'function')
      showNotification(err.message, 'error');
  }
}

// ── DYNAMIC FIELDS ────────────────────────────────────────────

function addEmailField(value = '') {
  const c   = document.getElementById('emails-container');
  const div = document.createElement('div');
  div.className = 'multi-field-row';
  div.innerHTML = `
    <input type="email" class="email-input" value="${value}" placeholder="email@example.com">
    <button type="button" class="btn-remove-field" onclick="this.parentElement.remove()">
      <i class="ph ph-x"></i>
    </button>`;
  c.appendChild(div);
}

function addPhoneField(value = '') {
  const c   = document.getElementById('phones-container');
  const div = document.createElement('div');
  div.className = 'multi-field-row';
  div.innerHTML = `
    <input type="tel" class="phone-input" value="${value}" placeholder="+254...">
    <button type="button" class="btn-remove-field" onclick="this.parentElement.remove()">
      <i class="ph ph-x"></i>
    </button>`;
  c.appendChild(div);
}

// ── EXPORT CSV ────────────────────────────────────────────────

function exportResidentsCSV() {
  if (!allResidents.length) {
    if (typeof showNotification === 'function') showNotification('No residents to export', 'warning');
    return;
  }

  const escape = v => {
    const s = String(v ?? '');
    // Wrap in quotes if contains comma, quote, or newline
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const headers = [
    'Unit Number', 'Resident Name', 'Type',
    'Emails', 'Phones', 'Monthly Charge (KES)',
    'Move-in Date', 'Status', 'Notes'
  ];

  const typeMap = {
    OWNER_OCCUPIER: 'Owner Occupier',
    DIRECT_TENANT:  'Direct Tenant',
    MANAGED_TENANT: 'Managed Tenant',
    ABSENTEE_OWNER: 'Absentee Owner'
  };

  const rows = allResidents.map(r => [
    escape(r.unit?.unitNumber),
    escape(r.fullName),
    escape(typeMap[r.type] || r.type),
    escape((r.emails || []).join('; ')),
    escape((r.phones || []).join('; ')),
    escape(r.unit?.monthlyCharge ?? ''),
    escape(r.moveInDate ? r.moveInDate.split('T')[0] : ''),
    escape(r.isActive === false ? 'Inactive' : 'Active'),
    escape(r.notes)
  ].join(','));

  const csv     = [headers.join(','), ...rows].join('\n');
  const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const link    = document.createElement('a');
  const date    = new Date().toISOString().split('T')[0];

  link.href     = url;
  link.download = `residents_${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  if (typeof showNotification === 'function')
    showNotification(`Exported ${allResidents.length} residents`, 'success');
}

// ── HELPERS ───────────────────────────────────────────────────

function clearForm() {
  ['f-unit-number','f-monthly-charge','f-full-name','f-move-in','f-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const typeEl = document.getElementById('f-type');
  if (typeEl) typeEl.value = 'OWNER_OCCUPIER';
  const activeEl = document.getElementById('f-is-active');
  if (activeEl) activeEl.value = 'true';
  document.getElementById('emails-container').innerHTML = '';
  document.getElementById('phones-container').innerHTML = '';
  hideError('modal-error');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent    = msg;
  el.style.display  = 'block';
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}