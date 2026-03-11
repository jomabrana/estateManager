// residents.js - Handles resident listing, searching, and management on the Residents page

let allResidents = [];
let allUnits     = [];
let estateMax    = 0;

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

    renderResidents(allResidents, allUnits);
    updateCounters(allResidents, allUnits, estateMax);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading" style="color:var(--danger)">${err.message}</td></tr>`;
  }
}

// ── COUNTERS ──────────────────────────────────────────────────

function updateCounters(residents, units, estateMax) {
  const active   = residents.filter(r => r.isActive !== false).length;
  const inactive = residents.filter(r => r.isActive === false).length;

  const occupiedUnitIds = new Set(
    residents.filter(r => r.isActive !== false).map(r => r.unit?.id).filter(Boolean)
  );
  const vacant = units.filter(u => !occupiedUnitIds.has(u.id)).length;

  const unitEl     = document.getElementById('counter-units');
  const unitOfEl   = document.getElementById('counter-units-of');
  const activeEl   = document.getElementById('counter-residents');
  const inactiveEl = document.getElementById('counter-inactive');
  const vacantEl   = document.getElementById('counter-vacant');

  if (unitEl)     unitEl.textContent     = units.length;
  if (unitOfEl) {
    unitOfEl.textContent = estateMax > 0 ? ` / ${estateMax}` : '';
    if (unitOfEl.parentElement) {
      unitOfEl.parentElement.style.color = (units.length > estateMax && estateMax > 0) ? 'var(--warning)' : '';
    }
  }
  if (activeEl)   activeEl.textContent   = active;
  if (inactiveEl) inactiveEl.textContent = inactive;
  if (vacantEl)   vacantEl.textContent   = vacant;
}

// ── RENDER ────────────────────────────────────────────────────

function renderResidents(list, units) {
  const tbody   = document.getElementById('residents-tbody');
  const countEl = document.getElementById('resident-count');

  // Build set of unit IDs that have at least one active resident
  const occupiedUnitIds = new Set(
    list.filter(r => r.isActive !== false).map(r => r.unit?.id).filter(Boolean)
  );

  // Vacant units = units with no active resident
  const vacantUnits = (units || allUnits).filter(u => !occupiedUnitIds.has(u.id));

  const totalRows = list.length + vacantUnits.length;
  if (countEl) countEl.textContent = `${list.length} resident${list.length !== 1 ? 's' : ''}, ${vacantUnits.length} vacant`;

  if (totalRows === 0) {
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

  // Resident rows
  const residentRows = list.map(r => {
    const emails      = (r.emails || []).join(', ') || '—';
    const phones      = (r.phones || []).join(', ') || '—';
    const charge      = formatKES(r.unit?.monthlyCharge || 0);
    const typeBadge   = typeLabel(r.type);
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
            <button title="Edit" onclick="editResident(${r.id})"><i class="ph ph-pencil-simple"></i></button>
            <button title="Delete" class="delete" onclick="deleteResident(${r.id}, '${r.fullName.replace(/'/g, "\\'")}')">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  });

  // Vacant unit rows — clickable, navigates to add-resident with prefilled unit
  const vacantRows = vacantUnits.map(u => {
    const charge = formatKES(u.monthlyCharge || 0);
    const params = new URLSearchParams({
      unitId:     u.id,
      unitNumber: u.unitNumber,
      charge:     u.monthlyCharge || 0
    });
    const href = `/add-resident.html?${params.toString()}`;

    return `
      <tr class="vacant-row" onclick="window.location.href='${href}'" title="Click to assign a resident to this unit" style="cursor:pointer;">
        <td><span class="unit-chip unit-chip-vacant">${u.unitNumber}</span></td>
        <td><span class="vacant-label"><i class="ph ph-house-line"></i> Vacant</span></td>
        <td>—</td>
        <td class="contact-cell">—</td>
        <td class="contact-cell">—</td>
        <td>${charge}</td>
        <td><span class="badge badge-vacant">Vacant</span></td>
        <td>
          <div class="action-icons">
            <button title="Assign resident" onclick="event.stopPropagation(); window.location.href='${href}'">
              <i class="ph ph-user-plus"></i>
            </button>
          </div>
        </td>
      </tr>`;
  });

  tbody.innerHTML = [...residentRows, ...vacantRows].join('');
}

function formatKES(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency', currency: 'KES', minimumFractionDigits: 0
  }).format(amount);
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
  const q = query.toLowerCase().trim();

  if (!q) {
    // Show everything including vacant rows
    renderResidents(allResidents, allUnits);
    return;
  }

  const filteredResidents = allResidents.filter(r =>
    r.fullName.toLowerCase().includes(q) ||
    (r.unit?.unitNumber || '').toLowerCase().includes(q) ||
    (r.emails || []).some(e => e.toLowerCase().includes(q)) ||
    (r.phones || []).some(p => p.includes(q))
  );

  // Also filter vacant units by unit number
  const occupiedUnitIds = new Set(
    allResidents.filter(r => r.isActive !== false).map(r => r.unit?.id).filter(Boolean)
  );
  const filteredVacant = allUnits
    .filter(u => !occupiedUnitIds.has(u.id))
    .filter(u => u.unitNumber.toLowerCase().includes(q));

  // Render with filtered vacant units passed explicitly
  // Temporarily override allUnits scope for this render call
  renderResidentsWithVacant(filteredResidents, filteredVacant);
}

// Render helper that accepts an explicit vacant list (used by filter)
function renderResidentsWithVacant(residents, vacantUnits) {
  const tbody   = document.getElementById('residents-tbody');
  const countEl = document.getElementById('resident-count');

  const totalRows = residents.length + vacantUnits.length;
  if (countEl) countEl.textContent = `${residents.length} resident${residents.length !== 1 ? 's' : ''}, ${vacantUnits.length} vacant`;

  if (totalRows === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><div class="empty-state"><div class="empty-state-icon"><i class="ph ph-magnifying-glass"></i></div><div class="empty-state-title">No results found</div></div></td></tr>`;
    return;
  }

  const residentRows = residents.map(r => {
    const emails      = (r.emails || []).join(', ') || '—';
    const phones      = (r.phones || []).join(', ') || '—';
    const charge      = formatKES(r.unit?.monthlyCharge || 0);
    const typeBadge   = typeLabel(r.type);
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
            <button title="Edit" onclick="editResident(${r.id})"><i class="ph ph-pencil-simple"></i></button>
            <button title="Delete" class="delete" onclick="deleteResident(${r.id}, '${r.fullName.replace(/'/g, "\\'")}')">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  });

  const vacantRows = vacantUnits.map(u => {
    const charge = formatKES(u.monthlyCharge || 0);
    const params = new URLSearchParams({ unitId: u.id, unitNumber: u.unitNumber, charge: u.monthlyCharge || 0 });
    const href   = `/add-resident.html?${params.toString()}`;
    return `
      <tr class="vacant-row" onclick="window.location.href='${href}'" title="Click to assign a resident to this unit" style="cursor:pointer;">
        <td><span class="unit-chip unit-chip-vacant">${u.unitNumber}</span></td>
        <td><span class="vacant-label"><i class="ph ph-house-line"></i> Vacant</span></td>
        <td>—</td>
        <td class="contact-cell">—</td>
        <td class="contact-cell">—</td>
        <td>${charge}</td>
        <td><span class="badge badge-vacant">Vacant</span></td>
        <td>
          <div class="action-icons">
            <button title="Assign resident" onclick="event.stopPropagation(); window.location.href='${href}'">
              <i class="ph ph-user-plus"></i>
            </button>
          </div>
        </td>
      </tr>`;
  });

  tbody.innerHTML = [...residentRows, ...vacantRows].join('');
}

// ── EDIT RESIDENT ─────────────────────────────────────────────

function editResident(id) {
  window.location.href = `/edit-tenant.html?residentId=${id}`;
}

// ── DELETE RESIDENT ───────────────────────────────────────────

async function deleteResident(id, name) {
  if (!confirm(`Delete resident "${name}"? This action cannot be undone.`)) return;

  const token = localStorage.getItem('token');

  try {
    const res  = await fetch(`/api/tenants/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');

    showNotification('Resident deleted', 'success');
    await fetchResidents();
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// ── EXPORT CSV ────────────────────────────────────────────────

function exportResidentsCSV() {
  if (!allResidents.length) {
    showNotification('No residents to export', 'warning');
    return;
  }

  const escape = v => {
    const s = String(v ?? '');
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

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];

  link.href     = url;
  link.download = `residents_${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  showNotification(`Exported ${allResidents.length} residents`, 'success');
}