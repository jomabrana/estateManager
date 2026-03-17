// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE DETAIL PAGE — Phase 4: Payment recording with FIFO allocation
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

  // Set default payment date to today
  document.getElementById("pay-date").value = new Date().toISOString().split("T")[0];

  await loadInvoice();
});

// ── Load Invoice ──────────────────────────────────────────────────────────────

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

    // Load payment history (Phase 4)
    await loadPaymentHistory(_invoiceId);

    document.getElementById("inv-loading").style.display = "none";
    document.getElementById("inv-content").style.display = "block";
  } catch (err) {
    document.getElementById("inv-loading").innerHTML =
      `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

// ── Render Invoice ────────────────────────────────────────────────────────────

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

  // Disable payment section if fully paid
  const paySection = document.getElementById("payment-recording-section");
  if (paySection && inv.status === "PAID") {
    paySection.style.display = "none";
  }

  renderMonthlyBreakdown(inv.monthlyCharges || []);
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

// ── PHASE 4: Preview Payment Allocation UI ────────────────────────────────────

async function previewPaymentAllocationUI() {
  const amountEl = document.getElementById("pay-amount");
  const amount = parseFloat(amountEl.value);

  if (!amount || amount <= 0) {
    showPayError("Please enter a valid amount");
    return;
  }

  if (!_invoice?.monthlyCharges || _invoice.monthlyCharges.length === 0) {
    showPayError("No monthly breakdown found for this invoice");
    return;
  }

  try {
    // Use the preview function from payments.js
    const preview = await previewPaymentAllocation(_invoiceId, amount);
    
    if (!preview) {
      showPayError("Error getting preview");
      return;
    }

    // Display the preview
    displayAllocationPreview(preview);
    clearPayError();
  } catch (err) {
    console.error("Preview error:", err);
    showPayError("Error previewing allocation");
  }
}

// ── PHASE 4: Submit Payment ───────────────────────────────────────────────────

async function submitPayment() {
  const amountEl = document.getElementById("pay-amount");
  const method   = document.getElementById("pay-method").value;
  const date     = document.getElementById("pay-date").value;
  const receipt  = document.getElementById("pay-receipt").value.trim();
  const notes    = document.getElementById("pay-notes").value.trim();
  const btn      = document.getElementById("pay-submit-btn");

  clearPayError();

  // Validation
  const amount = parseFloat(amountEl.value);
  if (!amount || amount <= 0) { 
    showPayError("Please enter a valid amount"); 
    return; 
  }
  if (!date) { 
    showPayError("Payment date is required"); 
    return; 
  }
  if (!method) { 
    showPayError("Payment method is required"); 
    return; 
  }
  if (!receipt) { 
    showPayError("Receipt number is required"); 
    return; 
  }

  const originalHTML = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Saving...';

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/invoices/${_invoiceId}/record-payment`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({
        amountPaid: amount,
        paymentDate: date,
        method,
        receiptNo: receipt,
        notes: notes || null
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to record payment");

    showNotification("✅ Payment recorded successfully!", "success");
    
    // Clear form
    amountEl.value = "";
    document.getElementById("pay-receipt").value = "";
    document.getElementById("pay-notes").value = "";
    document.getElementById("allocation-preview").style.display = "none";

    // Reload invoice
    await loadInvoice();
  } catch (err) {
    console.error("Record payment error:", err);
    showPayError(err.message || "Error recording payment");
    btn.disabled  = false;
    btn.innerHTML = originalHTML;
  }
}

// ── Error/Success Helpers ─────────────────────────────────────────────────────

function showPayError(msg) {
  const el = document.getElementById("pay-error");
  el.textContent = msg;
  el.classList.add("show");
}

function clearPayError() {
  const el = document.getElementById("pay-error");
  el.textContent = "";
  el.classList.remove("show");
}

function goToEdit() {
  window.location.href = `/add-invoice.html?edit=${_invoiceId}`;
}

// ── Formatting Helpers ────────────────────────────────────────────────────────

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", 
    currency: "KES", 
    minimumFractionDigits: 0
  }).format(parseFloat(amount) || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const datePart  = dateStr.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-KE", {
    day: "numeric", 
    month: "short", 
    year: "numeric"
  });
}

function monthLabel(month, year) {
  if (!month || !year) return "—";
  return new Date(year, month - 1, 1).toLocaleDateString("en-KE", { 
    month: "long", 
    year: "numeric" 
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