// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE DETAIL PAGE — Phase 2: includes monthly breakdown section
// ═══════════════════════════════════════════════════════════════════════════════

let _invoiceId = null;
let _invoice   = null;

document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureLoggedIn();
  if (!user) return;

  loadUserProfile(user);
  updateDateTime();
  setInterval(updateDateTime, 60000);
  document.querySelector("#logout-btn")?.addEventListener("click", handleLogout);

  const params = new URLSearchParams(window.location.search);
  _invoiceId = params.get("id") ? parseInt(params.get("id")) : null;

  if (!_invoiceId) {
    document.getElementById("inv-loading").innerHTML =
      '<p style="color:var(--danger)">No invoice ID specified.</p>';
    return;
  }

  document.getElementById("pay-date").value = new Date().toISOString().split("T")[0];
  await loadInvoice();
});

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadInvoice() {
  try {
    const token = localStorage.getItem("token");
    const res   = await fetch(`/api/invoices/${_invoiceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load invoice");

    _invoice = data.invoice;
    renderInvoice(_invoice);

    document.getElementById("inv-loading").style.display = "none";
    document.getElementById("inv-content").style.display = "block";
  } catch (err) {
    document.getElementById("inv-loading").innerHTML =
      `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderInvoice(inv) {
  document.getElementById("inv-subtitle").textContent =
    `${inv.referenceNo} — ${inv.resident?.fullName || ""}`;

  const totalPaid   = (inv.payments || []).reduce((s, p) => s + parseFloat(p.amountPaid), 0);
  const totalDue    = parseFloat(inv.amount) + parseFloat(inv.lateFee || 0);
  const outstanding = Math.max(0, totalDue - totalPaid);

  document.getElementById("sum-amount").textContent      = formatKES(totalDue);
  document.getElementById("sum-paid").textContent        = formatKES(totalPaid);
  document.getElementById("sum-outstanding").textContent = formatKES(outstanding);
  document.getElementById("sum-status").innerHTML        = statusBadge(inv.status);

  document.getElementById("d-ref").textContent     = inv.referenceNo;
  document.getElementById("d-period").textContent  = monthLabel(inv.billingMonth, inv.billingYear);
  document.getElementById("d-created").textContent = formatDate(inv.invoiceDate || inv.createdAt);
  document.getElementById("d-due").innerHTML       = dueDateDisplay(inv.dueDate);
  document.getElementById("d-notes").textContent   = inv.notes || "—";

  document.getElementById("d-resident").textContent = inv.resident?.fullName || "—";
  document.getElementById("d-unit").innerHTML =
    inv.unit ? `<span class="unit-chip">${inv.unit.unitNumber}</span>` : "—";
  document.getElementById("d-emails").textContent =
    (inv.resident?.emails || []).join(", ") || "—";
  document.getElementById("d-phones").textContent =
    (inv.resident?.phones || []).join(", ") || "—";

  const payBtn = document.querySelector("[data-action='open-payment']");
  if (payBtn && inv.status === "PAID") {
    payBtn.disabled = true;
    payBtn.title    = "Invoice is fully paid";
  }

  renderMonthlyBreakdown(inv.monthlyCharges || []);
  renderPayments(inv.payments || []);
}

// ── Monthly breakdown table ───────────────────────────────────────────────────

function renderMonthlyBreakdown(months) {
  const section = document.getElementById("monthly-section");
  const tbody   = document.getElementById("monthly-tbody");
  const countEl = document.getElementById("monthly-count");

  if (!months.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  if (countEl) countEl.textContent = `${months.length} month${months.length !== 1 ? "s" : ""}`;

  tbody.innerHTML = months.map(m => {
    const base        = parseFloat(m.baseAmount);
    const paid        = parseFloat(m.amountPaid || 0);
    const lateFee     = parseFloat(m.lateFee || 0);
    const remaining   = parseFloat(m.amountRemaining || 0);
    const totalDue    = base + lateFee;
    const daysOverdue = calcDaysOverdue(m.dueDate);

    const statusCls = {
      PAID:    "badge-success",
      PARTIAL: "badge-info",
      UNPAID:  daysOverdue > 0 ? "badge-danger" : "badge-warning"
    }[m.status] || "badge-warning";

    const statusText = m.status === "UNPAID" && daysOverdue > 0 ? "Overdue" : m.status.charAt(0) + m.status.slice(1).toLowerCase();

    return `
      <tr>
        <td><strong>${m.month}</strong></td>
        <td>${formatKES(base)}</td>
        <td>${lateFee > 0 ? `<span style="color:var(--danger)">${formatKES(lateFee)}</span>` : "—"}</td>
        <td>${formatKES(totalDue)}</td>
        <td class="text-success">${paid > 0 ? formatKES(paid) : "—"}</td>
        <td class="${remaining > 0 ? "text-danger" : "text-success"}"><strong>${formatKES(remaining)}</strong></td>
        <td>${dueDateDisplay(m.dueDate)}</td>
        <td><span class="badge ${statusCls}">${statusText}</span></td>
      </tr>`;
  }).join("");
}

// ── Payments table ────────────────────────────────────────────────────────────

function renderPayments(payments) {
  const tbody   = document.getElementById("payments-tbody");
  const countEl = document.getElementById("payment-count");

  if (countEl) countEl.textContent = `${payments.length} payment${payments.length !== 1 ? "s" : ""}`;

  if (!payments.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No payments recorded yet</td></tr>`;
    return;
  }

  tbody.innerHTML = payments.map(p => `
    <tr>
      <td>${formatDate(p.paymentDate)}</td>
      <td class="text-success"><strong>${formatKES(p.amountPaid)}</strong></td>
      <td><span class="badge badge-info">${p.method}</span></td>
      <td><code style="font-size:0.8rem;">${p.receiptNo}</code></td>
      <td style="color:var(--text-muted);font-size:0.85rem;">${p.notes || "—"}</td>
    </tr>`).join("");
}

// ── Payment modal ─────────────────────────────────────────────────────────────

function openPaymentModal() {
  if (_invoice) {
    const totalPaid   = (_invoice.payments || []).reduce((s, p) => s + parseFloat(p.amountPaid), 0);
    const outstanding = Math.max(0, parseFloat(_invoice.amount) + parseFloat(_invoice.lateFee || 0) - totalPaid);
    document.getElementById("pay-amount").value = outstanding > 0 ? outstanding.toFixed(2) : "";
  }
  document.getElementById("pay-error").style.display = "none";
  document.getElementById("payment-modal").classList.add("open");
}

function closePaymentModal() {
  document.getElementById("payment-modal").classList.remove("open");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("payment-modal")?.addEventListener("click", function(e) {
    if (e.target === this) closePaymentModal();
  });
});

async function submitPayment() {
  const amountEl = document.getElementById("pay-amount");
  const method   = document.getElementById("pay-method").value;
  const date     = document.getElementById("pay-date").value;
  const notes    = document.getElementById("pay-notes").value.trim();
  const btn      = document.getElementById("pay-submit-btn");

  document.getElementById("pay-error").style.display = "none";

  const amount = parseFloat(amountEl.value);
  if (!amount || amount <= 0) { showPayError("Please enter a valid amount"); return; }
  if (!date)                  { showPayError("Payment date is required"); return; }

  const originalHTML = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Saving...';

  try {
    const token = localStorage.getItem("token");
    const res   = await fetch("/api/payments", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ invoiceId: _invoiceId, amountPaid: amount, method, paymentDate: date, notes: notes || null })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to record payment");

    showNotification("Payment recorded successfully!", "success");
    closePaymentModal();
    amountEl.value = "";
    document.getElementById("pay-notes").value = "";
    await loadInvoice();
  } catch (err) {
    showPayError(err.message);
    btn.disabled  = false;
    btn.innerHTML = originalHTML;
  }
}

function showPayError(msg) {
  const el = document.getElementById("pay-error");
  el.textContent   = msg;
  el.style.display = "block";
}

function goToEdit() {
  window.location.href = `/add-invoice.html?edit=${_invoiceId}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", minimumFractionDigits: 0
  }).format(parseFloat(amount) || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  // Split off time before parsing so UTC midnight doesn't shift to previous day in EAT
  const datePart  = dateStr.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function monthLabel(month, year) {
  if (!month || !year) return "—";
  return new Date(year, month - 1, 1).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}

function calcDaysOverdue(dueDateStr) {
  if (!dueDateStr) return 0;
  // Parse as local date by taking only the date portion (YYYY-MM-DD).
  // Using new Date(isoString) shifts UTC midnight into local time in EAT/other
  // positive-offset zones, making the date appear one day earlier than intended.
  const datePart  = dueDateStr.split("T")[0];          // "2025-03-31"
  const [y, m, d] = datePart.split("-").map(Number);
  const dueDay    = new Date(y, m - 1, d);             // local midnight
  const today     = new Date();
  const todayDay  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((todayDay - dueDay) / 86400000));
}

function dueDateDisplay(dueDateStr) {
  if (!dueDateStr) return "—";
  const datePart  = dueDateStr.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  const dueDay    = new Date(y, m - 1, d);
  const today     = new Date();
  const todayDay  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff      = Math.floor((todayDay - dueDay) / 86400000);
  const str       = formatDate(dueDateStr);

  if (diff > 0)  return `<span style="color:var(--danger)">${str} <small>(${diff}d overdue)</small></span>`;
  if (diff === 0) return `<span style="color:var(--warning)">${str} <small>(due today)</small></span>`;
  return `${str} <small style="color:var(--text-muted);">(in ${Math.abs(diff)}d)</small>`;
}

function statusBadge(status) {
  const map = {
    PENDING: `<span class="badge badge-warning">Pending</span>`,
    PAID:    `<span class="badge badge-success">Paid</span>`,
    PARTIAL: `<span class="badge badge-info">Partial</span>`,
    OVERDUE: `<span class="badge badge-danger">Overdue</span>`
  };
  return map[status] || `<span class="badge">${status}</span>`;
}