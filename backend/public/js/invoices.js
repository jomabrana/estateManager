// invoices.js — SPA-safe: all state scoped to window._inv namespace
// to survive repeated script injection by index.js loadPage()

// ── State (on window to survive re-injection) ─────────────────
window._inv = {
  all:          [],
  statusFilter: "ALL",
  searchQuery:  "",
  estateName:   ""
};

// ── INIT — called by loadPage() in index.js ───────────────────

async function loadInvoices() {
  // Reset state on every load so stale data never bleeds between navigations
  window._inv.all          = [];
  window._inv.statusFilter = "ALL";
  window._inv.searchQuery  = "";

  // Reset filter tab UI to "All"
  document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
  const allTab = document.querySelector(".filter-tab[data-status='ALL']");
  if (allTab) allTab.classList.add("active");

  // Fetch estate name for CSV filename
  try {
    const token = localStorage.getItem("token");
    const meRes = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    if (meRes.ok) {
      const meData = await meRes.json();
      window._inv.estateName = meData.user?.estate?.name || "Estate";
    }
  } catch (_) {}

  await fetchAndRender();
}

async function fetchAndRender() {
  const tbody = document.getElementById("invoices-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="10" class="table-loading">Loading invoices...</td></tr>`;

  try {
    const token = localStorage.getItem("token");
    const res   = await fetch("/api/invoices", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data  = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load invoices");

    window._inv.all = data.invoices || [];
    updateCounters(window._inv.all);
    applyFilters();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" class="table-loading" style="color:var(--danger)">${err.message}</td></tr>`;
    }
  }
}

// ── COUNTERS ──────────────────────────────────────────────────

function updateCounters(invoices) {
  const count = s => invoices.filter(i => i.status === s).length;
  const set   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("inv-count-total",   invoices.length);
  set("inv-count-pending", count("PENDING"));
  set("inv-count-overdue", count("OVERDUE"));
  set("inv-count-partial", count("PARTIAL"));
  set("inv-count-paid",    count("PAID"));
}

// ── FILTERS ───────────────────────────────────────────────────

function setStatusFilter(status, btn) {
  window._inv.statusFilter = status;
  document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  applyFilters();
}

function filterInvoices(query) {
  window._inv.searchQuery = (query || "").toLowerCase().trim();
  applyFilters();
}

function applyFilters() {
  let list = window._inv.all || [];

  if (window._inv.statusFilter !== "ALL") {
    list = list.filter(i => i.status === window._inv.statusFilter);
  }

  const q = window._inv.searchQuery;
  if (q) {
    list = list.filter(i =>
      i.resident?.fullName?.toLowerCase().includes(q) ||
      i.unit?.unitNumber?.toLowerCase().includes(q) ||
      i.referenceNo?.toLowerCase().includes(q)
    );
  }

  renderInvoices(list);
}

// ── RENDER ────────────────────────────────────────────────────

function renderInvoices(list) {
  const tbody     = document.getElementById("invoices-tbody");
  const showingEl = document.getElementById("inv-showing");
  if (!tbody) return;

  if (showingEl) showingEl.textContent = `${list.length} invoice${list.length !== 1 ? "s" : ""}`;

  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="10" class="table-empty">
        <div class="empty-state">
          <div class="empty-state-icon"><i class="ph ph-receipt"></i></div>
          <div class="empty-state-title">No invoices found</div>
          <p>Try a different filter or create a new invoice.</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(inv => {
    const totalPaid   = (inv.payments || []).reduce((s, p) => s + parseFloat(p.amountPaid || 0), 0);
    const outstanding = Math.max(0, parseFloat(inv.amount || 0) + parseFloat(inv.lateFee || 0) - totalPaid);
    const months      = inv.monthlyCharges || [];
    const period      = months.length > 1
      ? `${months[0].month} → ${months[months.length - 1].month}`
      : monthLabel(inv.billingMonth, inv.billingYear);
    const daysOverdue = calcDaysOverdue(inv.dueDate);

    return `
      <tr class="clickable-row" onclick="viewInvoice(${inv.id})" style="cursor:pointer;">
        <td><span class="ref-chip">${inv.referenceNo}</span></td>
        <td><strong>${inv.resident?.fullName || "—"}</strong></td>
        <td><span class="unit-chip">${inv.unit?.unitNumber || "—"}</span></td>
        <td>${period}</td>
        <td>${formatKES(inv.amount)}</td>
        <td class="${totalPaid > 0 ? "text-success" : ""}">${formatKES(totalPaid)}</td>
        <td class="${outstanding > 0 ? "text-danger" : "text-success"}">
          <strong>${formatKES(outstanding)}</strong>
        </td>
        <td class="${daysOverdue > 0 ? "text-danger" : ""}">
          ${formatDate(inv.dueDate)}
          ${daysOverdue > 0 ? `<br><small>${daysOverdue}d overdue</small>` : ""}
        </td>
        <td>${statusLabel(inv.status, daysOverdue)}</td>
        <td>
          <div class="action-icons" onclick="event.stopPropagation()">
            <button title="View"   onclick="viewInvoice(${inv.id})"><i class="ph ph-eye"></i></button>
            <button title="Edit"   onclick="editInvoice(${inv.id})"><i class="ph ph-pencil-simple"></i></button>
            <button title="Delete" class="delete" onclick="deleteInvoice(${inv.id}, '${inv.referenceNo}')">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

// ── HELPERS ───────────────────────────────────────────────────

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", minimumFractionDigits: 0
  }).format(parseFloat(amount) || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const datePart  = dateStr.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function monthLabel(month, year) {
  if (!month || !year) return "—";
  return new Date(year, month - 1, 1).toLocaleDateString("en-KE", {
    month: "long", year: "numeric"
  });
}

function calcDaysOverdue(dueDateStr) {
  if (!dueDateStr) return 0;
  const datePart  = dueDateStr.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  const dueDay    = new Date(y, m - 1, d);
  const today     = new Date();
  const todayDay  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((todayDay - dueDay) / 86400000));
}

function statusLabel(status, daysOverdue) {
  if (status === "PENDING" && daysOverdue > 0)
    return `<span class="badge badge-danger">Overdue</span>`;
  const map = {
    PENDING: `<span class="badge badge-warning">Pending</span>`,
    PAID:    `<span class="badge badge-success">Paid</span>`,
    PARTIAL: `<span class="badge badge-info">Partial</span>`,
    OVERDUE: `<span class="badge badge-danger">Overdue</span>`
  };
  return map[status] || `<span class="badge">${status}</span>`;
}

// ── ACTIONS ───────────────────────────────────────────────────

function viewInvoice(id)   { window.location.href = `/invoice-detail.html?id=${id}`; }
function editInvoice(id)   { window.location.href = `/add-invoice.html?edit=${id}`; }

async function deleteInvoice(id, ref) {
  if (!confirm(`Delete invoice ${ref}? This cannot be undone.`)) return;
  const token = localStorage.getItem("token");
  try {
    const res  = await fetch(`/api/invoices/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete");
    showNotification("Invoice deleted", "success");
    await fetchAndRender();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

// ── GENERATE MONTHLY ──────────────────────────────────────────

async function generateMonthlyInvoices() {
  const now   = new Date();
  const label = now.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  if (!confirm(`Generate invoices for all active residents for ${label}?`)) return;

  const token = localStorage.getItem("token");
  try {
    const res  = await fetch("/api/invoices/generate-monthly", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate");
    showNotification(`${data.message} — ${data.created} created, ${data.skipped} skipped`, "success");
    await fetchAndRender();
  } catch (err) {
    showNotification(err.message, "error");
  }
}

// ── EXPORT CSV ────────────────────────────────────────────────

function exportInvoicesCSV() {
  const all = window._inv.all || [];
  if (!all.length) {
    showNotification("No invoices to export", "warning");
    return;
  }

  const esc = v => {
    const s = String(v ?? "");
    return (s.includes(",") || s.includes('"') || s.includes("\n"))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const headers = [
    "Reference", "Resident", "Unit", "Period",
    "Amount (KES)", "Paid (KES)", "Outstanding (KES)",
    "Due Date", "Status"
  ];

  const rows = all.map(inv => {
    const totalPaid   = (inv.payments || []).reduce((s, p) => s + parseFloat(p.amountPaid || 0), 0);
    const outstanding = Math.max(0, parseFloat(inv.amount || 0) + parseFloat(inv.lateFee || 0) - totalPaid);
    return [
      esc(inv.referenceNo),
      esc(inv.resident?.fullName),
      esc(inv.unit?.unitNumber),
      esc(monthLabel(inv.billingMonth, inv.billingYear)),
      esc(parseFloat(inv.amount || 0).toFixed(2)),
      esc(totalPaid.toFixed(2)),
      esc(outstanding.toFixed(2)),
      esc(inv.dueDate ? inv.dueDate.split("T")[0] : ""),
      esc(inv.status)
    ].join(",");
  });

  const csv       = [headers.join(","), ...rows].join("\n");
  const blob      = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url       = URL.createObjectURL(blob);
  const link      = document.createElement("a");
  const datePart  = new Date().toISOString().split("T")[0];
  // Sanitise estate name: strip characters that are invalid in filenames
  const namePart  = (window._inv.estateName || "Estate")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  link.href     = url;
  link.download = `${namePart}_Invoices_${datePart}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showNotification(`Exported ${all.length} invoices`, "success");
}