// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT CONTROLLER — Daraja C2B (Customer to Business) Integration
// ═══════════════════════════════════════════════════════════════════════════════
//
// HOW DARAJA C2B WORKS — THE FULL PICTURE
// ─────────────────────────────────────────
// Daraja C2B is the API that lets you RECEIVE M-PESA payments automatically.
// Here's the flow from the moment a resident sends money to your Paybill:
//
//  1. Resident opens M-PESA on their phone → Lipa Na M-PESA → Pay Bill
//     → enters your Paybill number + Account Number (e.g. their unit "Unit 5")
//     → enters amount → enters PIN
//
//  2. M-PESA sends a VALIDATION request to YOUR server (POST to /api/payments/validate)
//     asking: "Is this account number valid? Should I allow this transaction?"
//     Your server must respond within ~5 seconds with ResultCode: 0 (accept)
//     or ResultCode: C2B00011 (reject). This step is optional but recommended.
//
//  3. If validation passes, M-PESA processes the payment and sends a CONFIRMATION
//     request to YOUR server (POST to /api/payments/confirm) with the full
//     transaction details. This is the definitive "money received" event.
//     You MUST respond with ResultCode: 0 within ~5 seconds or M-PESA will retry.
//
//  4. Your server saves the payment to the database and links it to the resident.
//
// BEFORE ANY OF THIS WORKS — URL REGISTRATION
// ─────────────────────────────────────────────
// M-PESA doesn't know where to send those callbacks until you register your URLs.
// You call the Daraja Register URL API once (or whenever your URLs change), telling
// M-PESA: "For transactions on shortcode XXXXXX, send callbacks to these URLs."
// This is done via POST /api/payments/register-urls (protected, admin-only).
//
// YOUR CALLBACK URLS MUST BE:
//   • Publicly accessible (not localhost) — use ngrok for local dev
//   • HTTPS only
//   • Respond with HTTP 200 + correct JSON body within 5 seconds
//
// ENVIRONMENT VARIABLES NEEDED (.env)
// ─────────────────────────────────────
//   MPESA_CONSUMER_KEY       — from your Daraja app dashboard
//   MPESA_CONSUMER_SECRET    — from your Daraja app dashboard
//   MPESA_SHORTCODE          — your Paybill number (6 digits)
//   MPESA_ENVIRONMENT        — "sandbox" or "production"
//   APP_BASE_URL             — your public HTTPS URL e.g. https://yourdomain.com
//
// SANDBOX vs PRODUCTION
// ──────────────────────
// Sandbox:    https://sandbox.safaricom.co.ke  (fake money, test only)
// Production: https://api.safaricom.co.ke      (real money, go-live required)
// Switch is controlled by MPESA_ENVIRONMENT in .env
//
// ═══════════════════════════════════════════════════════════════════════════════

const prisma = require("../../prisma/client");

// ── reconcileInvoice ──────────────────────────────────────────────────────────
// Kept here (not imported from invoiceController) to avoid a circular
// require() dependency: api.js → paymentController → invoiceController → api.js
// The logic is identical to the copy in invoiceController.
async function reconcileInvoice(invoiceId) {
  const invoice = await prisma.invoice.findUnique({
    where:   { id: invoiceId },
    include: { payments: { select: { amountPaid: true } } }
  });
  if (!invoice) return;

  const totalPaid   = invoice.payments.reduce((s, p) => s + parseFloat(p.amountPaid), 0);
  const totalDue    = parseFloat(invoice.amount) + parseFloat(invoice.lateFee || 0);
  const outstanding = Math.max(0, totalDue - totalPaid);

  let status;
  if (totalPaid >= totalDue) status = "PAID";
  else if (totalPaid > 0)    status = "PARTIAL";
  else                       status = "PENDING";

  await prisma.invoice.update({
    where: { id: invoiceId },
    data:  { totalPaid, totalOutstanding: outstanding, status }
  });
}

// ── BASE URL switches automatically between sandbox and production ──
const MPESA_BASE_URL = process.env.MPESA_ENVIRONMENT === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

// ── STEP 1: Get an OAuth Access Token ────────────────────────────────────────
// Every Daraja API call requires a Bearer token. Tokens expire after 1 hour.
// We cache the token in memory and re-fetch only when it expires.
// Daraja uses HTTP Basic Auth: base64(ConsumerKey:ConsumerSecret)
// ─────────────────────────────────────────────────────────────────────────────
let _cachedToken    = null;
let _tokenExpiresAt = 0;

async function getDarajaToken() {
  // Return cached token if still valid (with 60s buffer)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) throw new Error("MPESA credentials not configured in .env");

  // Basic Auth = base64("ConsumerKey:ConsumerSecret")
  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Daraja token fetch failed: ${res.status} — ${body}`);
  }

  const data       = await res.json();
  _cachedToken     = data.access_token;
  // expires_in is in seconds; convert to ms timestamp
  _tokenExpiresAt  = Date.now() + parseInt(data.expires_in) * 1000;

  return _cachedToken;
}

// ── Helper: require estate for the calling user ───────────────────────────────
async function requireEstateId(userId) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { estateId: true }
  });
  if (!user?.estateId) throw new Error("NO_ESTATE");
  return user.estateId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER URLS
// POST /api/payments/register-urls   (protected — admin calls this once)
// ───────────────────────────────────────────────────────────────────────────────
// This tells M-PESA where to send validation and confirmation callbacks for
// your shortcode. You only need to call this:
//   • The first time you set up the integration
//   • Any time your server URL changes (e.g. new domain)
//
// ResponseType "Completed" means: if your validation URL is unreachable,
// M-PESA will complete the transaction anyway.
// ResponseType "Cancelled" means: if unreachable, transaction is cancelled.
// "Completed" is safer for production so payments aren't blocked by downtime.
// ═══════════════════════════════════════════════════════════════════════════════
const registerUrls = async (req, res) => {
  try {
    const token     = await getDarajaToken();
    const baseUrl   = process.env.APP_BASE_URL;
    const shortCode = process.env.MPESA_SHORTCODE;

    if (!baseUrl)   return res.status(500).json({ error: "APP_BASE_URL not set in .env" });
    if (!shortCode) return res.status(500).json({ error: "MPESA_SHORTCODE not set in .env" });

    const payload = {
      ShortCode:       shortCode,
      ResponseType:    "Completed",
      ConfirmationURL: `${baseUrl}/api/payments/confirm`,
      ValidationURL:   `${baseUrl}/api/payments/validate`
    };

    const mpesaRes = await fetch(`${MPESA_BASE_URL}/mpesa/c2b/v1/registerurl`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await mpesaRes.json();

    if (!mpesaRes.ok) {
      console.error("Register URLs failed:", data);
      return res.status(502).json({ error: "Daraja registration failed", details: data });
    }

    console.log("✅ Daraja URLs registered:", data);
    return res.json({ message: "URLs registered with M-PESA", data });

  } catch (err) {
    console.error("Register URLs error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION CALLBACK
// POST /api/payments/validate   (called by M-PESA — NO auth middleware)
// ───────────────────────────────────────────────────────────────────────────────
// M-PESA hits this URL BEFORE completing the transaction, asking:
// "Is this account number valid? Should I proceed?"
//
// The resident enters their unit number as the M-PESA account reference.
// e.g. "Unit 5" or "Unit 12"
//
// M-PESA expects a response within ~5 seconds.
// ResultCode 0       = Accept the transaction
// ResultCode C2B00011 = Reject (invalid account)
//
// IMPORTANT: This endpoint must NOT be behind your protect middleware.
// M-PESA calls it directly — there's no JWT token involved.
// ═══════════════════════════════════════════════════════════════════════════════
const validatePayment = async (req, res) => {
  // M-PESA sends this payload shape:
  // {
  //   TransactionType: "Pay Bill",
  //   TransID:         "LKXXXX1234",
  //   TransTime:       "20240315120000",
  //   TransAmount:     "5000.00",
  //   BusinessShortCode: "600XXX",
  //   BillRefNumber:   "Unit 5",        ← the account number the resident typed
  //   InvoiceNumber:   "",
  //   OrgAccountBalance: "0.00",
  //   ThirdPartyTransID: "",
  //   MSISDN:          "2547XXXXXXXX",  ← resident's phone (may be masked)
  //   FirstName:       "JOHN",
  //   MiddleName:      "",
  //   LastName:        "DOE"
  // }

  const { BillRefNumber } = req.body;

  console.log("📥 M-PESA Validation request:", JSON.stringify(req.body, null, 2));

  try {
    // Look up the unit by unitNumber (case-insensitive)
    const unit = await prisma.unit.findFirst({
      where: {
        unitNumber: { equals: BillRefNumber?.trim(), mode: "insensitive" }
      },
      include: {
        residents: { where: { isActive: true }, select: { id: true } }
      }
    });

    if (!unit || unit.residents.length === 0) {
      // Unknown unit or no active resident — reject
      console.warn(`⚠️  Validation rejected: unknown account "${BillRefNumber}"`);
      return res.json({
        ResultCode:   "C2B00011",
        ResultDesc:   "Invalid account number"
      });
    }

    // Accept — M-PESA will proceed to process the payment
    return res.json({ ResultCode: "0", ResultDesc: "Accepted" });

  } catch (err) {
    console.error("Validation error:", err);
    // On error, accept anyway so we don't block legitimate payments
    // The confirmation callback will still arrive and we save it there
    return res.json({ ResultCode: "0", ResultDesc: "Accepted" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRMATION CALLBACK
// POST /api/payments/confirm   (called by M-PESA — NO auth middleware)
// ───────────────────────────────────────────────────────────────────────────────
// M-PESA hits this URL AFTER the transaction is complete. Money has moved.
// This is where you save the payment to your database.
//
// The BillRefNumber is the account number the resident typed — we expect
// them to type their unit number (e.g. "Unit 5").
//
// We match the payment to a resident by:
//   1. Finding the unit by unitNumber
//   2. Getting the active resident on that unit
//   3. Finding their most recent PENDING invoice (if any) to link the payment
//
// M-PESA expects HTTP 200 + ResultCode 0 within ~5 seconds.
// If we don't respond in time, M-PESA will retry (up to 3 times).
// ═══════════════════════════════════════════════════════════════════════════════
const confirmPayment = async (req, res) => {
  const {
    TransID,            // M-PESA transaction ID e.g. "LGR019G3J4"
    TransTime,          // "20240315120530" — YYYYMMDDHHmmss
    TransAmount,        // "5000.00"
    BillRefNumber,      // "Unit 5" — account number resident entered
    MSISDN,             // "2547XXXXXXXX" — may be partially masked
    FirstName,
    MiddleName,
    LastName
  } = req.body;

  console.log("📥 M-PESA Confirmation:", JSON.stringify(req.body, null, 2));

  // Always respond immediately — save asynchronously
  // This ensures M-PESA gets its 200 OK within the timeout
  res.json({ ResultCode: "0", ResultDesc: "Accepted" });

  // ── Now process and save the payment ────────────────────────────────────────
  try {
    // Guard: don't save duplicate transactions
    const existing = await prisma.payment.findUnique({
      where: { receiptNo: TransID }
    });
    if (existing) {
      console.log(`⚠️  Duplicate transaction ignored: ${TransID}`);
      return;
    }

    // Find the unit by account reference (what resident typed)
    const unit = await prisma.unit.findFirst({
      where: {
        unitNumber: { equals: BillRefNumber?.trim(), mode: "insensitive" }
      },
      include: {
        residents: {
          where:   { isActive: true },
          orderBy: { createdAt: "asc" },
          take:    1
        }
      }
    });

    const resident = unit?.residents?.[0] ?? null;

    // Find the resident's oldest PENDING invoice to link this payment to
    // (if no invoice found, we still save the payment — it's unlinked)
    let invoiceId = null;
    if (resident) {
      const pendingInvoice = await prisma.invoice.findFirst({
        where:   { residentId: resident.id, status: { in: ["PENDING", "OVERDUE", "PARTIAL"] } },
        orderBy: { dueDate: "asc" }
      });
      if (pendingInvoice) invoiceId = pendingInvoice.id;
    }

    if (!invoiceId) {
      // No invoice to link — log and skip saving (or save to a separate log table)
      console.warn(`⚠️  Payment ${TransID} received for "${BillRefNumber}" but no matching invoice found. Saving as unlinked.`);
      // You could save to a separate "unmatched payments" log here
      return;
    }

    // Parse M-PESA timestamp: "20240315120530" → Date
    const paymentDate = parseTransTime(TransTime);

    // Fetch estateId so Payment.estateId (required by new schema) is satisfied
    const invoiceRecord = await prisma.invoice.findUnique({
      where:  { id: invoiceId },
      select: { estateId: true }
    });

    // Save the payment
    await prisma.payment.create({
      data: {
        invoiceId,
        estateId:   invoiceRecord.estateId,
        paymentDate,
        amountPaid: parseFloat(TransAmount),
        method:     "M-PESA",
        receiptNo:  TransID,
        notes:      buildPayerNote(FirstName, MiddleName, LastName, MSISDN)
      }
    });

    // Update invoice status based on how much has been paid
    await reconcileInvoice(invoiceId);

    console.log(`✅ Payment saved: ${TransID} — KES ${TransAmount} for ${BillRefNumber}`);

  } catch (err) {
    console.error("❌ Confirmation processing error:", err);
    // Don't re-throw — response was already sent to M-PESA
  }
};

// ── Parse M-PESA TransTime "YYYYMMDDHHmmss" → JS Date ────────────────────────
function parseTransTime(transTime) {
  if (!transTime || transTime.length < 14) return new Date();
  const y  = transTime.slice(0,  4);
  const mo = transTime.slice(4,  6);
  const d  = transTime.slice(6,  8);
  const h  = transTime.slice(8,  10);
  const mi = transTime.slice(10, 12);
  const s  = transTime.slice(12, 14);
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`); // EAT = UTC+3
}

// ── Build a readable note from the payer's name + phone ───────────────────────
function buildPayerNote(first, middle, last, phone) {
  const name = [first, middle, last].filter(Boolean).join(" ");
  const parts = [];
  if (name)  parts.push(`Paid by: ${name}`);
  if (phone) parts.push(`Phone: ${phone}`);
  return parts.join(" | ") || null;
}


// ═══════════════════════════════════════════════════════════════════════════════
// GET PAYMENTS  (protected — dashboard)
// GET /api/payments
// Returns all payments for the estate, newest first
// ═══════════════════════════════════════════════════════════════════════════════
const getPayments = async (req, res) => {
  try {
    const estateId = await requireEstateId(req.user.userId);

    const payments = await prisma.payment.findMany({
      where: { estateId },
      include: {
        invoice: {
          select: {
            id:          true,
            referenceNo: true,
            billingMonth: true,
            billingYear:  true,
            amount:       true,
            status:       true,
            resident: {
              select: { id: true, fullName: true }
            },
            unit: {
              select: { id: true, unitNumber: true }
            }
          }
        }
      },
      orderBy: { paymentDate: "desc" }
    });

    return res.json({ payments });

  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get payments error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RECORD MANUAL PAYMENT  (protected — for cash / bank transfer payments)
// POST /api/payments
// Body: { invoiceId, amountPaid, method, paymentDate, notes }
// ═══════════════════════════════════════════════════════════════════════════════
const createPayment = async (req, res) => {
  const { invoiceId, amountPaid, method, paymentDate, notes } = req.body;

  if (!invoiceId || !amountPaid || !method)
    return res.status(400).json({ error: "invoiceId, amountPaid and method are required" });

  try {
    const estateId = await requireEstateId(req.user.userId);

    // Verify invoice belongs to this estate
    const invoice = await prisma.invoice.findFirst({
      where: { id: parseInt(invoiceId), estateId }
    });
    if (!invoice)
      return res.status(404).json({ error: "Invoice not found" });

    // Generate a unique receipt number for manual payments
    const receiptNo = `MAN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const payment = await prisma.payment.create({
      data: {
        invoiceId:   parseInt(invoiceId),
        estateId,
        amountPaid:  parseFloat(amountPaid),
        method,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        receiptNo,
        notes:       notes || null
      }
    });

    await reconcileInvoice(parseInt(invoiceId));

    return res.status(201).json({ message: "Payment recorded", payment });

  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Create payment error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  registerUrls,
  validatePayment,
  confirmPayment,
  getPayments,
  createPayment
};