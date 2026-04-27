// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT CONTROLLER 
// Daraja C2B (Customer to Business) Integration + Manual Payments
// ALL payments use FIFO allocation via Phase 4 endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const prisma = require("../../prisma/client");
const { recordPaymentWithFIFO } = require("../utils/payment-allocation-utility");

// ── BASE URL switches automatically between sandbox and production ──
const MPESA_BASE_URL = process.env.MPESA_ENVIRONMENT === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

// ── OAuth Token Caching ────────────────────────────────────────────────────────
let _cachedToken    = null;
let _tokenExpiresAt = 0;

async function getDarajaToken() {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) {
    return _cachedToken;
  }

  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) throw new Error("MPESA credentials not configured in .env");

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
// REGISTER URLS — POST /api/payments/register-urls (protected)
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
// VALIDATION CALLBACK — POST /api/payments/validate (no auth)
// Called by M-PESA BEFORE transaction to validate account number
// ═══════════════════════════════════════════════════════════════════════════════
const validatePayment = async (req, res) => {
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
      console.warn(`⚠️  Validation rejected: unknown account "${BillRefNumber}"`);
      return res.json({
        ResultCode:   "C2B00011",
        ResultDesc:   "Invalid account number"
      });
    }

    // Accept
    return res.json({ ResultCode: "0", ResultDesc: "Accepted" });

  } catch (err) {
    console.error("Validation error:", err);
    // On error, accept anyway
    return res.json({ ResultCode: "0", ResultDesc: "Accepted" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIRMATION CALLBACK — POST /api/payments/confirm (no auth)
// Called by M-PESA AFTER transaction is complete
// NOW USES PHASE 4 FIFO ALLOCATION
// ═══════════════════════════════════════════════════════════════════════════════
const confirmPayment = async (req, res) => {
  const {
    TransID,            // M-PESA transaction ID
    TransTime,          // "20240315120530" YYYYMMDDHHmmss
    TransAmount,        // "5000.00"
    BillRefNumber,      // "Unit 5" — account number
    MSISDN,             // "2547XXXXXXXX"
    FirstName,
    MiddleName,
    LastName
  } = req.body;

  console.log("📥 M-PESA Confirmation:", JSON.stringify(req.body, null, 2));

  // ✅ Respond immediately to M-PESA
  res.json({ ResultCode: "0", ResultDesc: "Accepted" });

  // ── Process asynchronously ────────────────────────────────────────────────────
  try {
    // Guard: duplicate transaction
    const existing = await prisma.payment.findUnique({
      where: { receiptNo: TransID }
    });
    if (existing) {
      console.log(`⚠️  Duplicate transaction ignored: ${TransID}`);
      return;
    }

    // Find unit and resident
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

    // Find oldest PENDING/OVERDUE/PARTIAL invoice
    let invoiceId = null;
    if (resident) {
      const pendingInvoice = await prisma.invoice.findFirst({
        where:   { residentId: resident.id, status: { in: ["PENDING", "OVERDUE", "PARTIAL"] } },
        orderBy: { dueDate: "asc" }
      });
      if (pendingInvoice) invoiceId = pendingInvoice.id;
    }

    if (!invoiceId) {
      console.warn(`⚠️  Payment ${TransID} for "${BillRefNumber}" has no matching invoice. Skipping.`);
      return;
    }

    // ✅ NOW USE PHASE 4 FIFO ALLOCATION ✅
    const paymentDate = parseTransTime(TransTime);
    const receipt = buildMpesaReceipt(TransID, FirstName, MiddleName, LastName, MSISDN);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { estateId: true }
    });

    // Use recordPaymentWithFIFO from payment-allocation-utility.js
    const result = await recordPaymentWithFIFO(
      invoiceId,
      parseFloat(TransAmount),
      paymentDate,
      "M-PESA",
      TransID,  // receiptNo
      receipt,  // notes
      invoice.estateId
    );

    console.log(`✅ M-PESA Payment saved with FIFO allocation: ${TransID} — KES ${TransAmount}`);
    console.log(`   Allocated to ${result.allocations.length} month(s)`);

  } catch (err) {
    console.error("❌ Confirmation processing error:", err);
    // Don't re-throw — response already sent to M-PESA
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

// ── Build M-PESA receipt note with payer info ──────────────────────────────────
function buildMpesaReceipt(transId, first, middle, last, phone) {
  const name = [first, middle, last].filter(Boolean).join(" ");
  const parts = [];
  if (name)    parts.push(`Paid by: ${name}`);
  if (phone)   parts.push(`Phone: ${phone}`);
  if (transId) parts.push(`M-PESA Ref: ${transId}`);
  return parts.join(" | ") || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET PAYMENTS — GET /api/payments (protected)
// List all payments for the estate
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
// CREATE PAYMENT (MANUAL) — POST /api/payments (protected)
// Record manual payment (Cash, Bank Transfer, Check)
// NOW USES PHASE 4 FIFO ALLOCATION
// ═══════════════════════════════════════════════════════════════════════════════
const createPayment = async (req, res) => {
  const { invoiceId, amountPaid, method, paymentDate, receiptNo, notes } = req.body;

  // Validation
  if (!invoiceId || !amountPaid || !method || !receiptNo) {
    return res.status(400).json({
      error: "invoiceId, amountPaid, method, and receiptNo are required"
    });
  }

  if (parseFloat(amountPaid) <= 0) {
    return res.status(400).json({ error: "amountPaid must be greater than 0" });
  }

  try {
    const estateId = await requireEstateId(req.user.userId);

    // Verify invoice belongs to this estate
    const invoice = await prisma.invoice.findFirst({
      where: { id: parseInt(invoiceId), estateId }
    });
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // ✅ NOW USE PHASE 4 FIFO ALLOCATION ✅
    const result = await recordPaymentWithFIFO(
      parseInt(invoiceId),
      parseFloat(amountPaid),
      paymentDate ? new Date(paymentDate) : new Date(),
      method,
      receiptNo,
      notes || null,
      estateId
    );

    return res.status(201).json({
      message: "Payment recorded successfully with FIFO allocation",
      payment: {
        id: result.payment.id,
        amount: parseFloat(result.payment.amountPaid),
        method: result.payment.method,
        receiptNo: result.payment.receiptNo,
        date: result.payment.paymentDate
      },
      allocations: result.allocations.map(a => ({
        month: a.month,
        allocated: a.allocated
      })),
      invoice: {
        id: result.invoice.id,
        status: result.invoice.status,
        totalPaid: parseFloat(result.invoice.totalPaid),
        totalOutstanding: parseFloat(result.invoice.totalOutstanding)
      }
    });

  } catch (err) {
    if (err.message === "NO_ESTATE") {
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    }
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    console.error("Create payment error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

/**
 * GET /api/payments/:id
 * Fetch a single payment with full details including resident, unit, invoice, and allocations
 */
const getPaymentById = async (req, res) => {
    try {
        const { id } = req.params;
        const paymentId = parseInt(id);
 
        if (isNaN(paymentId)) {
            return res.status(400).json({ error: 'Invalid payment ID' });
        }
 
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                invoice: {
                    include: {
                        resident: {
                            include: {
                                unit: true
                            }
                        },
                        invoiceMonths: {
                            orderBy: {
                                month: 'asc'
                            }
                        }
                    }
                },
                recordedBy: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                }
            }
        });
 
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
 
        return res.json(payment);
 
    } catch (error) {
        console.error('Error fetching payment:', error);
        return res.status(500).json({ error: 'Failed to fetch payment details' });
    }
};
 
/**
 * GET /api/payments/:id/allocations
 * Get payment allocation breakdown by month (for FIFO display)
 */
const getPaymentAllocations = async (req, res) => {
    try {
        const { id } = req.params;
        const paymentId = parseInt(id);

        // Fetch the payment AND the specific allocations created for it
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                // Assuming you have a PaymentAllocation table as seen in your utility
                allocations: { 
                    orderBy: { month: 'asc' } 
                },
                invoice: {
                    include: { invoiceMonths: true }
                }
            }
        });

        if (!payment) return res.status(404).json({ error: 'Payment not found' });

        // Map the data so the frontend sees the "snapshot" of what this payment did
        const breakdown = payment.allocations.map(alloc => {
            const monthData = payment.invoice.invoiceMonths.find(m => m.month === alloc.month);
            return {
                month: alloc.month,
                allocatedAmount: parseFloat(alloc.allocatedAmount),
                // Show the state of the month AFTER this payment
                currentStatus: monthData?.status || 'PAID',
                remainingOnMonth: monthData?.amountRemaining || 0
            };
        });

        return res.json(breakdown);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Failed to fetch breakdown' });
    }
};

module.exports = {
  registerUrls,
  validatePayment,
  confirmPayment,
  getPayments,
  createPayment,
  getPaymentById,
  getPaymentAllocations
};