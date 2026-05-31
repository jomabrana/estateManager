// backend/public/js/payments.js
// Frontend logic for payment recording and management

/**
 * Load and display all payments for the estate
 * Called by: Payments list page on load
 * */
 
async function loadPayments() {
  const tbody = document.getElementById("payments-tbody");
  if (!tbody) {
    console.warn("payments-tbody element not found");
    return;
  }

  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading payments...</td></tr>';

  try {
    const token = localStorage.getItem("token");
    
    const response = await fetch("/api/payments", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const payments = data.payments || [];

    const countEl = document.getElementById("pay-count");
    if (countEl) countEl.textContent = `${payments.length} payment${payments.length !== 1 ? "s" : ""}`;

    if (payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No payments recorded yet</td></tr>';
      return;
    }

    let html = "";
    payments.forEach(payment => {
      const resident = payment.invoice?.resident?.fullName || "—";
      const unit = payment.invoice?.unit?.unitNumber || "—";
      const amount = parseFloat(payment.amountPaid) || 0;
      const method = payment.method || "—";
      const date = payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString("en-KE") : "—";
      const invoiceStatus = payment.invoice?.status || "—";

      const statusBadge = invoiceStatusBadge(invoiceStatus);

      html += `
        <tr>
          <td>${resident}</td>
          <td>${unit}</td>
          <td class="payment-amount">${formatKES(amount)}</td>
          <td><span class="method-chip">${escapeHtml(method)}</span></td>
          <td>${date}</td>
          <td>${statusBadge}</td>
          <td>
            <a href="/invoice-detail.html?id=${payment.invoiceId}" class="action-link" title="View invoice">
              <i class="ph ph-eye"></i> View
            </a>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

  } catch (err) {
    console.error("Error loading payments:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading" style="color:var(--danger)">${escapeHtml(err.message)}</td></tr>`;
    
    if (typeof showNotification === 'function') {
      showNotification(`Error loading payments: ${err.message}`, 'error');
    }
  }
}


 // Preview payment allocation
// @param {number} invoiceId - Invoice ID
// @param {number} amountToPay - Amount to preview

async function previewPaymentAllocation(invoiceId, amountToPay) {
  if (!invoiceId || !amountToPay || parseFloat(amountToPay) <= 0) {
    alert("Please enter a valid invoice and amount");
    return;
  }

  try {
    const response = await fetch(`/api/invoices/${invoiceId}/preview-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountToPay: parseFloat(amountToPay) })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.error}`);
      return null;
    }

    const data = await response.json();
    return data.preview;
  } catch (err) {
    console.error("Preview error:", err);
    alert("Error previewing payment");
    return null;
  }
}


 // Display payment allocation preview
 // @param {Object} preview - Preview data from API
 
function displayAllocationPreview(preview) {
  const container = document.getElementById("allocation-preview");
  if (!container) return;

  let html = `
    <div class="preview-section">
      <h4>Payment Allocation Preview (FIFO)</h4>
      <div class="preview-info">
        <p><strong>Resident:</strong> ${preview.resident}</p>
        <p><strong>Amount to Pay:</strong> ${formatKES(preview.amountToPay)}</p>
      </div>
      
      <table class="preview-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Base</th>
            <th>Late Fee</th>
            <th>Currently Paid</th>
            <th>Will Allocate</th>
            <th>Will Be Paid</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
  `;

  for (const alloc of preview.allocations) {
    const status = alloc.willBeFullyPaid ? "PAID" : "PARTIAL";
    const statusClass = alloc.willBeFullyPaid ? "badge-success" : "badge-warning";

    html += `
      <tr>
        <td><strong>${alloc.month}</strong></td>
        <td>${formatKES(alloc.baseAmount)}</td>
        <td>${formatKES(alloc.lateFee)}</td>
        <td>${formatKES(alloc.currentlyPaid)}</td>
        <td style="color:var(--primary);font-weight:700;">${formatKES(alloc.willAllocate)}</td>
        <td style="font-weight:700;">${formatKES(alloc.willBePaid)}</td>
        <td><span class="badge ${statusClass}">${status}</span></td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
      
      <div class="preview-summary">
        <p><strong>Months Being Paid:</strong> ${preview.summary.monthsBeingPaid}</p>
        <p><strong>Total Allocated:</strong> ${formatKES(preview.summary.totalAllocated)}</p>
  `;

  if (preview.summary.unallocated > 0) {
    html += `<p style="color:var(--danger);"><strong>Unallocated:</strong> ${formatKES(preview.summary.unallocated)}</p>`;
  }

  html += `</div></div>`;

  container.innerHTML = html;
  container.style.display = "block";
}


 // Record a payment
 // @param {number} invoiceId - Invoice ID

async function recordPayment(invoiceId) {
  const amountPaid = document.getElementById("pay-amount")?.value;
  const paymentDate = document.getElementById("pay-date")?.value;
  const method = document.getElementById("pay-method")?.value;
  const receiptNo = document.getElementById("pay-receipt")?.value;
  const notes = document.getElementById("pay-notes")?.value;

  if (!amountPaid || !paymentDate || !method || !receiptNo) {
    alert("Please fill in all required fields");
    return;
  }

  if (parseFloat(amountPaid) <= 0) {
    alert("Amount must be greater than 0");
    return;
  }

  try {
    const response = await fetch(`/api/invoices/${invoiceId}/record-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountPaid: parseFloat(amountPaid),
        paymentDate,
        method,
        receiptNo,
        notes: notes || null
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.error}`);
      return;
    }

    const data = await response.json();
    alert(`${data.message}\n\nInvoice Status: ${data.invoice.status}\nRemaining: ${formatKES(data.invoice.totalOutstanding)}`);

    // Clear form
    document.getElementById("pay-amount").value = "";
    document.getElementById("pay-receipt").value = "";
    document.getElementById("pay-notes").value = "";

    // Reload invoice
    if (window.loadInvoiceDetail) {
      window.loadInvoiceDetail(invoiceId);
    }
  } catch (err) {
    console.error("Record payment error:", err);
    alert("Error recording payment");
  }
}


// Load and display payment history for an invoice
 // @param {number} invoiceId - Invoice ID
 
async function loadPaymentHistory(invoiceId) {
  const container = document.getElementById("payment-history-section");
  if (!container) return;

  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`/api/invoices/${invoiceId}/payment-history`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const payments = data.payments || [];

    if (payments.length === 0) {
      container.innerHTML = "<p style='color:#94a3b8;'>No payments recorded yet</p>";
      const countEl = document.getElementById("payment-count");
      if (countEl) countEl.textContent = "0 payments";
      return;
    }

    const countEl = document.getElementById("payment-count");
    if (countEl) countEl.textContent = `${payments.length} payment${payments.length !== 1 ? "s" : ""}`;

    let html = `
      <div class="payment-history">
        <table class="payments-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Receipt</th>
              <th>Allocations</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const payment of payments) {
      const allocText = payment.allocations
        .map(a => `${a.month}: KES ${parseInt(a.amount).toLocaleString()}`)
        .join(" | ");

      const payDate = new Date(payment.date).toLocaleDateString();

      html += `
        <tr>
          <td>${payDate}</td>
          <td style="font-weight:700;color:var(--success);">${formatKES(payment.amount)}</td>
          <td>${payment.method}</td>
          <td style="font-family:monospace;font-size:0.85rem;">${payment.receiptNo}</td>
          <td style="font-size:0.85rem;">${allocText}</td>
          <td style="font-size:0.85rem;color:#94a3b8;">${payment.notes || "—"}</td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error("Load payment history error:", err);
    container.innerHTML = `<p style='color:var(--danger);'>Error loading payment history: ${escapeHtml(err.message)}</p>`;
  }
}


// Export functions
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    loadPayments,
    previewPaymentAllocation,
    displayAllocationPreview,
    recordPayment,
    loadPaymentHistory
  };
}

function invoiceStatusBadge(status) {
  const normalized = (status || "").toUpperCase();
  const cls = {
    PAID: "badge-success",
    PARTIAL: "badge-info",
    PENDING: "badge-warning",
    OVERDUE: "badge-danger"
  }[normalized] || "badge-warning";

  const text = normalized
    ? normalized.charAt(0) + normalized.slice(1).toLowerCase()
    : "Unknown";
  return `<span class="badge ${cls}">${text}</span>`;
}

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0
  }).format(parseFloat(amount) || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
