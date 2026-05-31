// communications.js — residents targeting list (Phase 1)

let _commResidents = [];

function commStatusBadge(status) {
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

async function loadCommunications() {
  const tbody = document.getElementById("communications-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Loading residents...</td></tr>`;

  try {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/communications/residents-summary", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to load residents");

    const residents = data.residents || [];
    _commResidents = residents;
    const countEl = document.getElementById("comm-count");
    if (countEl) countEl.textContent = `${residents.length} resident${residents.length !== 1 ? "s" : ""}`;

    populateResidentSelect(residents);

    if (!residents.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No residents found</td></tr>`;
      return;
    }

    tbody.innerHTML = residents.map(r => {
      const emails = (r.emails || []).filter(Boolean).join(", ") || "—";
      const phones = (r.phones || []).filter(Boolean).join(", ") || "—";
      const unitNumber = r.unitNumber || "—";

      return `
        <tr>
          <td><strong>${escapeHtml(r.fullName || "—")}</strong></td>
          <td><span class="unit-chip">${escapeHtml(unitNumber)}</span></td>
          <td>${commStatusBadge(r.invoiceStatus)}</td>
          <td class="${(parseFloat(r.totalOwing) || 0) > 0 ? "text-danger" : "text-success"}"><strong>${formatKES(r.totalOwing)}</strong></td>
          <td class="text-muted">${escapeHtml(emails)}</td>
          <td class="text-muted">${escapeHtml(phones)}</td>
          <td>
            <button class="btn btn-secondary" onclick="openEmailModal(${r.id}); event.stopPropagation();">
              <i class="ph ph-envelope"></i> Email
            </button>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading" style="color:var(--danger)">${escapeHtml(err.message)}</td></tr>`;
  }
}

function populateResidentSelect(residents) {
  const select = document.getElementById("comm-resident");
  if (!select) return;

  select.innerHTML = `<option value="">Select...</option>` + residents.map(r => {
    const unit = r.unitNumber ? ` (${r.unitNumber})` : "";
    return `<option value="${r.id}">${escapeHtml(r.fullName)}${escapeHtml(unit)}</option>`;
  }).join("");
}

function getResidentById(id) {
  const num = parseInt(id);
  return (_commResidents || []).find(r => parseInt(r.id) === num) || null;
}

function syncRecipientForResident(residentId) {
  const resident = getResidentById(residentId);
  const recipientEl = document.getElementById("comm-recipient");
  if (!recipientEl) return;
  const firstEmail = (resident?.emails || []).find(Boolean) || "";
  recipientEl.value = firstEmail;
}

function openEmailModal(residentId) {
  const residentSelect = document.getElementById("comm-resident");
  const typeSelect = document.getElementById("comm-type");
  const subjectEl = document.getElementById("comm-subject");
  const messageEl = document.getElementById("comm-message");

  if (residentSelect) residentSelect.value = String(residentId);
  if (typeSelect) typeSelect.value = "EMAIL";
  if (subjectEl) subjectEl.value = "";
  if (messageEl) messageEl.value = "";

  syncRecipientForResident(residentId);
  if (typeof openModal === "function") openModal("communication-modal");
}

async function submitCommunication(e) {
  e.preventDefault();

  const residentId = document.getElementById("comm-resident")?.value;
  const type = document.getElementById("comm-type")?.value;
  const recipient = document.getElementById("comm-recipient")?.value?.trim();
  const subject = document.getElementById("comm-subject")?.value?.trim();
  const content = document.getElementById("comm-message")?.value?.trim();

  if (!residentId || !type || !recipient || !subject || !content) {
    if (typeof showNotification === "function") showNotification("Fill in all required fields", "error");
    return;
  }

  const token = localStorage.getItem("token");
  try {
    const res = await fetch("/api/communications/send-manual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        residentId: parseInt(residentId),
        type,
        recipient,
        subject,
        content
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to send");

    if (typeof showNotification === "function") showNotification(data.message || "Sent", "success");
    if (typeof closeModal === "function") closeModal("communication-modal");
  } catch (err) {
    if (typeof showNotification === "function") showNotification(err.message, "error");
  }
}

window.loadCommunications = loadCommunications;
window.openEmailModal = openEmailModal;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("communication-form")?.addEventListener("submit", submitCommunication);
  document.getElementById("comm-resident")?.addEventListener("change", (e) => syncRecipientForResident(e.target.value));
});
