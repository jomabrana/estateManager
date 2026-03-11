// ═══════════════════════════════════════════════════════════════════════════════
// ADD / EDIT INVOICE PAGE
// ═══════════════════════════════════════════════════════════════════════════════

let _residents  = [];
let _editMode   = false;
let _editId     = null;

document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureLoggedIn();
  if (!user) return;

  loadUserProfile(user);
  updateDateTime();
  setInterval(updateDateTime, 60000);

  document.querySelector("#logout-btn")?.addEventListener("click", handleLogout);
  document.querySelector("#invoice-form").addEventListener("submit", handleSubmit);

  // Detect edit mode from URL ?edit=<id>
  const params = new URLSearchParams(window.location.search);
  _editId = params.get("edit") ? parseInt(params.get("edit")) : null;
  _editMode = !!_editId;

  if (_editMode) {
    document.getElementById("page-title").textContent    = "Edit Invoice";
    document.getElementById("page-subtitle").textContent = "Update invoice details";
    document.getElementById("form-heading").textContent  = "Edit Invoice";
    document.getElementById("submit-label").textContent  = "Update Invoice";
  }

  // Set default billing month/year to current month
  const now = new Date();
  document.getElementById("f-billing-month").value = now.getMonth() + 1;
  document.getElementById("f-billing-year").value  = now.getFullYear();

  // Set default due date to last day of current month
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  document.getElementById("f-due-date").value = lastDay.toISOString().split("T")[0];

  await loadResidents();

  if (_editMode) await prefillEditForm(_editId);
});

// ── Load residents into dropdown ──────────────────────────────────────────────

async function loadResidents() {
  const select = document.getElementById("f-resident");
  try {
    const token = localStorage.getItem("token");
    const res   = await fetch("/api/tenants", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data  = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load residents");

    _residents = (data.tenants || []).filter(r => r.isActive !== false);

    select.innerHTML = `<option value="">Select a resident...</option>` +
      _residents.map(r =>
        `<option value="${r.id}" data-charge="${r.unit?.monthlyCharge || 0}" data-unit="${r.unit?.unitNumber || ''}">
          ${r.fullName} — ${r.unit?.unitNumber || '?'}
        </option>`
      ).join("");
  } catch (err) {
    select.innerHTML = `<option value="">Failed to load residents</option>`;
    showError(err.message);
  }
}

// ── When resident changes, auto-fill amount and show unit info ────────────────

function onResidentChange(select) {
  const opt    = select.options[select.selectedIndex];
  const charge = parseFloat(opt.dataset.charge) || 0;
  const unit   = opt.dataset.unit || "—";

  const row = document.getElementById("unit-charge-row");
  if (opt.value) {
    row.style.display = "";
    document.getElementById("display-unit").textContent   = unit;
    document.getElementById("display-charge").textContent = formatKES(charge);
    document.getElementById("f-amount").value = charge || "";
  } else {
    row.style.display = "none";
    document.getElementById("f-amount").value = "";
  }
}

// ── Pre-fill form in edit mode ────────────────────────────────────────────────

async function prefillEditForm(id) {
  try {
    const token = localStorage.getItem("token");
    const res   = await fetch(`/api/invoices/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data  = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load invoice");

    const inv = data.invoice;

    // Select resident
    const select = document.getElementById("f-resident");
    select.value = inv.residentId;
    onResidentChange(select);

    document.getElementById("f-billing-month").value = inv.billingMonth;
    document.getElementById("f-billing-year").value  = inv.billingYear;
    document.getElementById("f-amount").value        = parseFloat(inv.amount);
    document.getElementById("f-due-date").value      = inv.dueDate?.split("T")[0] || "";
    document.getElementById("f-notes").value         = inv.notes || "";

    // Lock resident + period in edit mode (changing them would invalidate payments)
    select.disabled = true;
    document.getElementById("f-billing-month").disabled = true;
    document.getElementById("f-billing-year").disabled  = true;

  } catch (err) {
    showError(err.message);
  }
}

// ── Form submit ───────────────────────────────────────────────────────────────

async function handleSubmit(e) {
  e.preventDefault();

  const errorEl = document.getElementById("form-error");
  errorEl.style.display = "none";

  const residentId   = document.getElementById("f-resident").value;
  const billingMonth = document.getElementById("f-billing-month").value;
  const billingYear  = document.getElementById("f-billing-year").value;
  const amount       = document.getElementById("f-amount").value;
  const dueDate      = document.getElementById("f-due-date").value;
  const notes        = document.getElementById("f-notes").value.trim();

  if (!residentId && !_editMode) { showError("Please select a resident"); return; }
  if (!amount || parseFloat(amount) <= 0) { showError("Amount must be greater than 0"); return; }
  if (!dueDate) { showError("Due date is required"); return; }

  const btn = document.getElementById("submit-btn");
  const originalHTML = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Saving...';

  try {
    const token   = localStorage.getItem("token");
    const url     = _editMode ? `/api/invoices/${_editId}` : "/api/invoices";
    const method  = _editMode ? "PUT" : "POST";

    const payload = _editMode
      ? { amount: parseFloat(amount), dueDate, notes }
      : { residentId: parseInt(residentId), billingMonth: parseInt(billingMonth),
          billingYear: parseInt(billingYear), amount: parseFloat(amount), dueDate, notes };

    const res  = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Failed to save invoice");
      btn.disabled  = false;
      btn.innerHTML = originalHTML;
      return;
    }

    showNotification(
      _editMode ? "Invoice updated successfully!" : "Invoice created successfully!",
      "success"
    );
    setTimeout(() => { window.location.href = "/?page=invoices"; }, 1500);

  } catch (err) {
    showError("Network error. Please try again.");
    btn.disabled  = false;
    btn.innerHTML = originalHTML;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById("form-error");
  el.textContent   = msg;
  el.style.display = "block";
  window.scrollTo(0, 0);
}

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", minimumFractionDigits: 0
  }).format(parseFloat(amount) || 0);
}