// ═══════════════════════════════════════════════════════════════════════════════
// BULK GENERATE INVOICES PAGE
// ═══════════════════════════════════════════════════════════════════════════════

let _residents    = [];   // all active residents from /api/tenants
let _existingInvs = [];   // invoices already created for selected month

document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureLoggedIn();
  if (!user) return;

  loadUserProfile(user);
  updateDateTime();
  setInterval(updateDateTime, 60000);
  document.querySelector("#logout-btn")?.addEventListener("click", handleLogout);

  // Default to current month/year
  const now = new Date();
  document.getElementById("sel-month").value = now.getMonth() + 1;
  document.getElementById("sel-year").value  = now.getFullYear();

  // Auto-load preview for current month on page open
  await loadPreview();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREVIEW
// Fetches all active residents + all invoices for the selected month,
// then shows which residents will get a new invoice vs which already have one.
// ═══════════════════════════════════════════════════════════════════════════════
async function loadPreview() {
  const btn    = document.getElementById("preview-btn");
  const month  = parseInt(document.getElementById("sel-month").value);
  const year   = parseInt(document.getElementById("sel-year").value);

  if (!month || !year || year < 2020) {
    showNotification("Please select a valid month and year", "warning");
    return;
  }

  const origHTML = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Loading...';

  try {
    const token = localStorage.getItem("token");

    // Fetch residents and existing invoices in parallel
    const [resRes, invRes] = await Promise.all([
      fetch("/api/tenants",   { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/invoices?status=PENDING&status=PAID&status=PARTIAL&status=OVERDUE`,
            { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const resData = await resRes.json();
    const invData = await invRes.json();

    if (!resRes.ok) throw new Error(resData.error || "Failed to load residents");
    if (!invRes.ok) throw new Error(invData.error || "Failed to load invoices");

    _residents = (resData.tenants || []).filter(r => r.isActive !== false);

    // Filter existing invoices for the selected month/year
    _existingInvs = (invData.invoices || []).filter(
      i => i.billingMonth === month && i.billingYear === year
    );

    renderPreview(month, year);

  } catch (err) {
    showNotification(err.message, "error");
  } finally {
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}

function renderPreview(month, year) {
  const tbody    = document.getElementById("preview-tbody");
  const section  = document.getElementById("preview-section");
  const willStat = document.getElementById("stat-will-create");
  const skipStat = document.getElementById("stat-will-skip");

  // Last day of billing month as due date
  const dueDate = new Date(year, month, 0);
  const dueDateStr = dueDate.toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric"
  });

  // Build a set of residentIds that already have an invoice this month
  const existingSet = new Set(_existingInvs.map(i => i.residentId));

  let willCreate = 0;
  let willSkip   = 0;

  const rows = _residents.map(r => {
    const alreadyExists = existingSet.has(r.id);
    const charge = parseFloat(r.unit?.monthlyCharge || 0);

    if (alreadyExists) willSkip++;
    else               willCreate++;

    return `
      <tr class="resident-preview-row">
        <td><strong>${r.fullName}</strong></td>
        <td><span class="unit-chip">${r.unit?.unitNumber || "—"}</span></td>
        <td>${formatKES(charge)}</td>
        <td>${dueDateStr}</td>
        <td>
          ${alreadyExists
            ? `<span class="skip-badge"><i class="ph ph-check"></i> Already exists</span>`
            : `<span class="badge badge-success"><i class="ph ph-plus"></i> Will create</span>`}
        </td>
      </tr>`;
  }).join("");

  if (!_residents.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No active residents found in this estate</td></tr>`;
  } else {
    tbody.innerHTML = rows;
  }

  willStat.textContent = `${willCreate} will be created`;
  skipStat.textContent = `${willSkip} already exist`;

  // Disable generate button if nothing to create
  const generateBtn = document.getElementById("generate-btn");
  if (generateBtn) {
    generateBtn.disabled = willCreate === 0;
    generateBtn.title    = willCreate === 0 ? "All residents already have invoices for this month" : "";
  }

  section.style.display = "block";
  // Hide result banner when re-previewing
  document.getElementById("result-banner").style.display = "none";
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRM GENERATE
// Calls POST /api/invoices/generate-monthly with selected month/year.
// ═══════════════════════════════════════════════════════════════════════════════
async function confirmGenerate() {
  const month = parseInt(document.getElementById("sel-month").value);
  const year  = parseInt(document.getElementById("sel-year").value);

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-KE", {
    month: "long", year: "numeric"
  });

  if (!confirm(`Generate invoices for all eligible residents for ${monthName}?`)) return;

  const btn      = document.getElementById("generate-btn");
  const origHTML = btn.innerHTML;
  btn.disabled  = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Generating...';

  try {
    const token = localStorage.getItem("token");
    const res   = await fetch("/api/invoices/generate-monthly", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ billingMonth: month, billingYear: year })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");

    showResultBanner(
      `✅ ${data.message} — ${data.created} invoice${data.created !== 1 ? "s" : ""} created, ${data.skipped} skipped.`,
      "success"
    );
    showNotification(`${data.created} invoices generated!`, "success");

    // Refresh preview to reflect new state
    await loadPreview();

  } catch (err) {
    showResultBanner(`❌ ${err.message}`, "error");
    btn.disabled  = false;
    btn.innerHTML = origHTML;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showResultBanner(msg, type) {
  const el = document.getElementById("result-banner");
  el.textContent   = msg;
  el.className     = `result-banner ${type}`;
  el.style.display = "block";
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatKES(amount) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", minimumFractionDigits: 0
  }).format(parseFloat(amount) || 0);
}