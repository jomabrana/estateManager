// backend/public/js/late-fees.js
// Frontend logic for late fee management

/**
 * Apply late fees to an invoice
 * @param {number} invoiceId - Invoice ID
 */
async function applyLateFees(invoiceId) {
  if (!invoiceId) {
    alert("No invoice selected");
    return;
  }

  const confirmed = confirm(
    "Are you sure you want to apply late fees to this invoice?\n\n" +
    "This will calculate and add late fees based on the estate's late fee configuration."
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`/api/invoices/${invoiceId}/apply-late-fees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedBy: "ADMIN" })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.error}`);
      return;
    }

    const data = await response.json();
    alert(`✅ ${data.message}`);

    // Reload invoice to show updated late fees
    if (window.loadInvoiceDetail) {
      const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
      window.loadInvoiceDetail(invoiceId);
    }
  } catch (err) {
    console.error("Apply late fees error:", err);
    alert("Error applying late fees");
  }
}

/**
 * Waive a late fee
 * @param {string} feeId - Late fee ID
 * @param {string} reason - Reason for waiving
 */
async function waveLateFee(feeId, reason = "") {
  if (!feeId) {
    alert("No late fee selected");
    return;
  }

  const waveReason = prompt(
    "Enter reason for waiving this late fee (optional):",
    reason
  );

  if (waveReason === null) return; // User cancelled

  try {
    const response = await fetch(`/api/late-fees/${feeId}/waive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: waveReason || null })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.error}`);
      return;
    }

    alert("✅ Late fee waived successfully");

    // Reload invoice to show updated fees
    if (window.loadInvoiceDetail) {
      const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
      window.loadInvoiceDetail(invoiceId);
    }
  } catch (err) {
    console.error("Waive late fee error:", err);
    alert("Error waiving late fee");
  }
}

/**
 * Load and display late fees for an invoice
 * @param {number} invoiceId - Invoice ID
 */
async function loadInvoiceLateFees(invoiceId) {
  const container = document.getElementById("late-fees-section");
  if (!container) return;

  try {
    const response = await fetch(`/api/invoices/${invoiceId}/late-fees`);

    if (!response.ok) {
      console.error("Error loading late fees");
      return;
    }

    const data = await response.json();
    const lateFees = data.lateFees || [];

    if (lateFees.length === 0) {
      container.innerHTML = "<p style='color:#94a3b8;'>No late fees applied</p>";
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="late-fees-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Base Amount</th>
              <th>Days Overdue</th>
              <th>Fee Type</th>
              <th>Fee Amount</th>
              <th>Status</th>
              <th>Applied Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const fee of lateFees) {
      const status = fee.status === "WAIVED" ? "❌ Waived" : "✅ Active";
      const statusColor = fee.status === "WAIVED" ? "#94a3b8" : "#22c55e";
      const feeTypeDisplay = fee.feeType === "PERCENTAGE" ? `${fee.feeValue}%` : `KES ${fee.feeValue}`;
      const appliedDate = new Date(fee.appliedDate).toLocaleDateString();

      let actionBtn = "";
      if (fee.status === "ACTIVE") {
        actionBtn = `<button class="btn btn-sm btn-danger" onclick="waveLateFee('${fee.id}')">Waive</button>`;
      } else {
        actionBtn = `<span style="color:#94a3b8;font-size:0.85rem;">Waived ${new Date(fee.waivedDate).toLocaleDateString()}</span>`;
      }

      html += `
        <tr>
          <td>${fee.monthAffected}</td>
          <td>KES ${parseInt(fee.baseAmount).toLocaleString()}</td>
          <td>${fee.daysOverdue} days</td>
          <td>${feeTypeDisplay}</td>
          <td style="color:#ef4444;font-weight:600;">KES ${parseInt(fee.calculatedAmount).toLocaleString()}</td>
          <td><span style="color:${statusColor};">${status}</span></td>
          <td>${appliedDate}</td>
          <td>${actionBtn}</td>
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
    console.error("Load late fees error:", err);
    container.innerHTML = "<p style='color:#ef4444;'>Error loading late fees</p>";
  }
}

/**
 * Load and display estate late fee configuration
 * @param {number} estateId - Estate ID
 */
async function loadEstateLateFeConfig(estateId) {
  const container = document.getElementById("late-fee-config-display");
  if (!container) return;

  try {
    const response = await fetch(`/api/estates/${estateId}/late-fee-config`);

    if (!response.ok) {
      console.error("Error loading late fee config");
      return;
    }

    const data = await response.json();
    const config = data.lateFeeConfig;

    if (!config.enabled) {
      container.innerHTML =
        "<p style='color:#94a3b8;'>Late fees are disabled for this estate</p>";
      return;
    }

    const feeTypeDisplay =
      config.type === "PERCENTAGE"
        ? `${config.value}% of base amount`
        : `KES ${config.value} per month`;
    const maxCapText = config.maxCap ? `up to KES ${config.maxCap}` : "no limit";

    let html = `
      <div class="config-details">
        <div class="config-row">
          <span class="label">Status:</span>
          <span class="value" style="color:#22c55e;">✅ Enabled</span>
        </div>
        <div class="config-row">
          <span class="label">Fee Type:</span>
          <span class="value">${feeTypeDisplay}</span>
        </div>
        <div class="config-row">
          <span class="label">Kicks in after:</span>
          <span class="value">${config.kickInAfterDays} days</span>
        </div>
        <div class="config-row">
          <span class="label">Compounding:</span>
          <span class="value">${config.compounding === "SIMPLE" ? "Simple" : "Compound"}</span>
        </div>
        <div class="config-row">
          <span class="label">Cap:</span>
          <span class="value">${maxCapText}</span>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    console.error("Load late fee config error:", err);
    container.innerHTML =
      "<p style='color:#ef4444;'>Error loading configuration</p>";
  }
}

/**
 * Save estate late fee configuration
 */
async function saveLateFeeConfig() {
  const estateId = document.getElementById("config-estate-id").value;
  const enabled = document.getElementById("config-enabled").checked;
  const type = document.getElementById("config-type").value;
  const value = parseFloat(document.getElementById("config-value").value);
  const kickInAfterDays = parseInt(document.getElementById("config-kickin").value);
  const compounding = document.getElementById("config-compounding").value;
  const maxCap = document.getElementById("config-maxcap").value
    ? parseFloat(document.getElementById("config-maxcap").value)
    : null;

  if (!estateId || !type || !value || value <= 0) {
    alert("Please fill in all required fields");
    return;
  }

  try {
    const response = await fetch(`/api/estates/${estateId}/late-fee-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        type,
        value,
        kickInAfterDays,
        compounding,
        maxCap
      })
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Error: ${error.error}`);
      return;
    }

    alert("✅ Late fee configuration saved successfully");

    // Reload config display
    if (window.loadEstateLateFeConfig) {
      window.loadEstateLateFeConfig(estateId);
    }
  } catch (err) {
    console.error("Save config error:", err);
    alert("Error saving configuration");
  }
}

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    applyLateFees,
    waveLateFee,
    loadInvoiceLateFees,
    loadEstateLateFeConfig,
    saveLateFeeConfig
  };
}