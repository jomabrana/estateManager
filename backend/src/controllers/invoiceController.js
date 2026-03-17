//invoice controller
const prisma = require("../../prisma/client");
const { 
  recordPaymentWithFIFO, 
  previewPaymentAllocation,
  getPaymentHistory
} = require("../utils/payment-allocation-utility");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireEstate(userId) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { estateId: true }
  });
  if (!user?.estateId) throw new Error("NO_ESTATE");
  return user.estateId;
}

function generateReferenceNo(residentId, billingMonth, billingYear) {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const mm   = String(billingMonth).padStart(2, "0");
  return `INV-${residentId}-${billingYear}${mm}-${rand}`;
}

// Format a billing month/year into "YYYY-MM" string for InvoiceMonth.month
function toMonthStr(billingMonth, billingYear) {
  return `${billingYear}-${String(billingMonth).padStart(2, "0")}`;
}

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

// ── InvoiceMonth helpers ──────────────────────────────────────────────────────

// Creates a single InvoiceMonth record for an invoice.
// Idempotent — skips if one already exists for this invoice.
async function createInvoiceMonth(tx, invoice) {
  const monthStr = toMonthStr(invoice.billingMonth, invoice.billingYear);
  const amount   = parseFloat(invoice.amount);

  // Check if already exists (handles re-runs or concurrent calls)
  const existing = await tx.invoiceMonth.findFirst({
    where: { invoiceId: invoice.id, month: monthStr }
  });
  if (existing) return existing;

  return tx.invoiceMonth.create({
    data: {
      invoiceId:       invoice.id,
      month:           monthStr,
      dueDate:         invoice.dueDate,
      baseAmount:      amount,
      amountRemaining: amount,
      amountPaid:      0,
      lateFee:         0,
      status:          "UNPAID"
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/invoices
// ═══════════════════════════════════════════════════════════════════════════════
const getInvoices = async (req, res) => {
  try {
    const estateId = await requireEstate(req.user.userId);

    const where = { estateId };
    if (req.query.status)     where.status     = req.query.status;
    if (req.query.residentId) where.residentId = parseInt(req.query.residentId);

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        resident:      { select: { id: true, fullName: true } },
        unit:          { select: { id: true, unitNumber: true } },
        payments:      { select: { id: true, amountPaid: true, paymentDate: true, method: true, receiptNo: true } },
        monthlyCharges: { orderBy: { month: "asc" } }
      },
      orderBy: { dueDate: "desc" }
    });

    return res.json({ invoices });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get invoices error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/invoices/overdue
// ═══════════════════════════════════════════════════════════════════════════════
const getOverdueInvoices = async (req, res) => {
  try {
    const estateId = await requireEstate(req.user.userId);

    const invoices = await prisma.invoice.findMany({
      where:   { estateId, status: { in: ["OVERDUE", "PARTIAL"] } },
      include: {
        resident:      { select: { id: true, fullName: true } },
        unit:          { select: { id: true, unitNumber: true } },
        payments:      { select: { amountPaid: true } },
        monthlyCharges: { orderBy: { month: "asc" } }
      },
      orderBy: { dueDate: "asc" }
    });

    return res.json({ invoices });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get overdue error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/invoices/resident/:residentId
// Rolling invoice view — all invoices + monthlyCharges for a resident
// ═══════════════════════════════════════════════════════════════════════════════
const getInvoicesByResident = async (req, res) => {
  try {
    const estateId = await requireEstate(req.user.userId);

    const invoices = await prisma.invoice.findMany({
      where: {
        residentId: parseInt(req.params.residentId),
        estateId
      },
      include: {
        resident:      { select: { id: true, fullName: true, emails: true, phones: true } },
        unit:          { select: { id: true, unitNumber: true, monthlyCharge: true } },
        payments:      { orderBy: { paymentDate: "desc" }, select: { id: true, amountPaid: true, paymentDate: true, method: true, receiptNo: true, notes: true } },
        monthlyCharges: { orderBy: { month: "asc" } }
      },
      orderBy: { billingYear: "desc", billingMonth: "desc" }
    });

    if (!invoices.length)
      return res.status(404).json({ error: "No invoices found for this resident" });

    // Compute rolling totals across all invoices
    const totalOutstanding = invoices.reduce((s, i) => s + parseFloat(i.totalOutstanding || 0), 0);
    const totalPaid        = invoices.reduce((s, i) => s + parseFloat(i.totalPaid || 0), 0);

    return res.json({ invoices, totalOutstanding, totalPaid });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get invoices by resident error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/invoices/:id
// ═══════════════════════════════════════════════════════════════════════════════
const getInvoice = async (req, res) => {
  try {
    const estateId = await requireEstate(req.user.userId);

    const invoice = await prisma.invoice.findFirst({
      where: { id: parseInt(req.params.id), estateId },
      include: {
        resident:      { select: { id: true, fullName: true, emails: true, phones: true } },
        unit:          { select: { id: true, unitNumber: true, monthlyCharge: true } },
        payments: {
          orderBy: { paymentDate: "desc" },
          select:  { id: true, amountPaid: true, paymentDate: true, method: true, receiptNo: true, notes: true }
        },
        monthlyCharges: { orderBy: { month: "asc" } }
      }
    });

    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    return res.json({ invoice });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get invoice error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/invoices
// Creates Invoice + InvoiceMonth in one transaction.
// ═══════════════════════════════════════════════════════════════════════════════
const createInvoice = async (req, res) => {
  const { residentId, amount, dueDate, billingMonth, billingYear, notes } = req.body;

  if (!residentId || !dueDate)
    return res.status(400).json({ error: "residentId and dueDate are required" });

  try {
    const estateId = await requireEstate(req.user.userId);

    const resident = await prisma.resident.findFirst({
      where:   { id: parseInt(residentId), unit: { estateId } },
      include: { unit: { select: { id: true, monthlyCharge: true } } }
    });
    if (!resident) return res.status(404).json({ error: "Resident not found in this estate" });

    const now    = new Date();
    const bMonth = billingMonth ? parseInt(billingMonth) : now.getMonth() + 1;
    const bYear  = billingYear  ? parseInt(billingYear)  : now.getFullYear();

    const duplicate = await prisma.invoice.findFirst({
      where: { residentId: parseInt(residentId), billingMonth: bMonth, billingYear: bYear }
    });
    if (duplicate)
      return res.status(409).json({
        error: `An invoice for this resident already exists for ${bMonth}/${bYear}`
      });

    const invoiceAmount = amount
      ? parseFloat(amount)
      : parseFloat(resident.unit.monthlyCharge);

    const referenceNo = generateReferenceNo(residentId, bMonth, bYear);

    // Create Invoice + InvoiceMonth atomically
    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          residentId:       parseInt(residentId),
          unitId:           resident.unitId,
          estateId,
          amount:           invoiceAmount,
          totalOutstanding: invoiceAmount,
          totalPaid:        0,
          dueDate:          new Date(dueDate),
          billingMonth:     bMonth,
          billingYear:      bYear,
          referenceNo,
          status:           "PENDING",
          notes:            notes || null
        }
      });

      await createInvoiceMonth(tx, inv);
      return inv;
    });

    // Fetch full invoice with relations for response
    const full = await prisma.invoice.findUnique({
      where:   { id: invoice.id },
      include: {
        resident:      { select: { id: true, fullName: true } },
        unit:          { select: { id: true, unitNumber: true } },
        monthlyCharges: { orderBy: { month: "asc" } }
      }
    });

    return res.status(201).json({ message: "Invoice created", invoice: full });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Create invoice error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/invoices/:id
// Updates invoice fields. If amount changes, syncs the InvoiceMonth.baseAmount
// and InvoiceMonth.amountRemaining proportionally.
// ═══════════════════════════════════════════════════════════════════════════════
const updateInvoice = async (req, res) => {
  const { amount, dueDate, status, notes } = req.body;

  try {
    const estateId = await requireEstate(req.user.userId);

    const invoice = await prisma.invoice.findFirst({
      where:   { id: parseInt(req.params.id), estateId },
      include: { monthlyCharges: true }
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    await prisma.$transaction(async (tx) => {
      const data = {};
      if (amount   !== undefined) data.amount  = parseFloat(amount);
      if (dueDate  !== undefined) data.dueDate = new Date(dueDate);
      if (status   !== undefined) data.status  = status;
      if (notes    !== undefined) data.notes   = notes;

      await tx.invoice.update({ where: { id: invoice.id }, data });

      // Sync InvoiceMonth if amount changed
      if (amount !== undefined) {
        const newAmount = parseFloat(amount);
        for (const month of invoice.monthlyCharges) {
          const alreadyPaid   = parseFloat(month.amountPaid || 0);
          const newRemaining  = Math.max(0, newAmount - alreadyPaid);
          const newStatus     = newRemaining <= 0 ? "PAID" : alreadyPaid > 0 ? "PARTIAL" : "UNPAID";

          await tx.invoiceMonth.update({
            where: { id: month.id },
            data:  {
              baseAmount:      newAmount,
              amountRemaining: newRemaining,
              status:          newStatus,
              ...(dueDate !== undefined ? { dueDate: new Date(dueDate) } : {})
            }
          });
        }
      } else if (dueDate !== undefined) {
        // Sync dueDate on InvoiceMonths even if amount didn't change
        for (const month of invoice.monthlyCharges) {
          await tx.invoiceMonth.update({
            where: { id: month.id },
            data:  { dueDate: new Date(dueDate) }
          });
        }
      }
    });

    if (amount !== undefined) await reconcileInvoice(invoice.id);

    const updated = await prisma.invoice.findUnique({
      where:   { id: invoice.id },
      include: {
        resident:      { select: { id: true, fullName: true } },
        unit:          { select: { id: true, unitNumber: true } },
        payments:      { select: { id: true, amountPaid: true, method: true, paymentDate: true, receiptNo: true } },
        monthlyCharges: { orderBy: { month: "asc" } }
      }
    });

    return res.json({ message: "Invoice updated", invoice: updated });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Update invoice error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/invoices/:id
// ═══════════════════════════════════════════════════════════════════════════════
const deleteInvoice = async (req, res) => {
  try {
    const estateId = await requireEstate(req.user.userId);

    const invoice = await prisma.invoice.findFirst({
      where:   { id: parseInt(req.params.id), estateId },
      include: { payments: { select: { id: true } } }
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    if (invoice.payments.length > 0)
      return res.status(409).json({
        error: `Cannot delete invoice with ${invoice.payments.length} recorded payment(s). Reverse payments first.`
      });

    // InvoiceMonth records deleted automatically via onDelete: Cascade
    await prisma.invoice.delete({ where: { id: invoice.id } });
    return res.json({ message: "Invoice deleted" });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Delete invoice error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/invoices/generate-monthly
// Bulk-creates Invoice + InvoiceMonth for all active residents this month.
// Accepts optional body: { billingMonth, billingYear } to generate for any month.
// ═══════════════════════════════════════════════════════════════════════════════
const generateMonthlyInvoices = async (req, res) => {
  try {
    const estateId = await requireEstate(req.user.userId);

    const now    = new Date();
    const bMonth = req.body?.billingMonth ? parseInt(req.body.billingMonth) : now.getMonth() + 1;
    const bYear  = req.body?.billingYear  ? parseInt(req.body.billingYear)  : now.getFullYear();
    const dueDate = new Date(bYear, bMonth, 0); // last day of billing month

    const residents = await prisma.resident.findMany({
      where:   { unit: { estateId }, isActive: true },
      include: { unit: { select: { id: true, monthlyCharge: true } } }
    });

    let created = 0;
    let skipped = 0;

    for (const resident of residents) {
      const exists = await prisma.invoice.findFirst({
        where: { residentId: resident.id, billingMonth: bMonth, billingYear: bYear }
      });
      if (exists) { skipped++; continue; }

      const invoiceAmount = parseFloat(resident.unit.monthlyCharge);
      const referenceNo   = generateReferenceNo(resident.id, bMonth, bYear);

      await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
          data: {
            residentId:       resident.id,
            unitId:           resident.unitId,
            estateId,
            amount:           invoiceAmount,
            totalOutstanding: invoiceAmount,
            totalPaid:        0,
            dueDate,
            billingMonth:     bMonth,
            billingYear:      bYear,
            referenceNo,
            status:           "PENDING"
          }
        });
        await createInvoiceMonth(tx, inv);
      });

      created++;
    }

    const mm = String(bMonth).padStart(2, "0");
    return res.json({
      message: `Generated invoices for ${bYear}-${mm}`,
      created,
      skipped
    });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Generate invoices error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/invoices/backfill-months  (admin utility — run once)
// Creates missing InvoiceMonth records for all existing invoices that don't
// have one yet. Safe to re-run — skips invoices that already have a month.
// ═══════════════════════════════════════════════════════════════════════════════
const backfillInvoiceMonths = async (req, res) => {
  try {
    const estateId = await requireEstate(req.user.userId);

    const invoices = await prisma.invoice.findMany({
      where:   { estateId },
      include: { monthlyCharges: { select: { id: true } } }
    });

    let created = 0;
    let skipped = 0;

    for (const inv of invoices) {
      if (inv.monthlyCharges.length > 0) { skipped++; continue; }
      await prisma.$transaction(async (tx) => {
        await createInvoiceMonth(tx, inv);
      });
      created++;
    }

    return res.json({
      message: `Backfill complete`,
      created,
      skipped
    });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Backfill error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// invoiceController - PHASE 3 LATE FEE ADDITIONS
// Add these functions to your existing invoiceController.js

const { calculateLateFee, calculateDaysOverdue } = require("../utils/late-fees-utility");

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/invoices/:invoiceId/apply-late-fees
// Applies late fees to overdue invoice months
// ═══════════════════════════════════════════════════════════════════════════════
const applyLateFees = async (req, res) => {
  const { invoiceId } = req.params;
  const { appliedBy } = req.body;

  if (!invoiceId) 
    return res.status(400).json({ error: "invoiceId is required" });

  try {
    // Get user's estate
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId) 
      return res.status(400).json({ error: "User not linked to estate" });

    // Get invoice with full details
    const invoice = await prisma.invoice.findFirst({
      where: { id: parseInt(invoiceId), estateId: user.estateId },
      include: {
        monthlyCharges: { orderBy: { month: "asc" } },
        lateFees: { where: { status: "ACTIVE" } }
      }
    });

    if (!invoice)
      return res.status(404).json({ error: "Invoice not found" });

    // Get estate late fee config
    const estate = await prisma.estate.findUnique({
      where: { id: user.estateId },
      select: {
        lateFeeEnabled: true,
        lateFeeType: true,
        lateFeeValue: true,
        lateFeeKickInAfterDays: true,
        lateFeeCompounding: true,
        lateFeeMaxCap: true
      }
    });

    if (!estate.lateFeeEnabled)
      return res.status(400).json({ error: "Late fees are not enabled for this estate" });

    let feesApplied = [];

    // Process each invoice month
    await prisma.$transaction(async (tx) => {
      for (const month of invoice.monthlyCharges) {
        // Skip if already has an active late fee
        const existingFee = await tx.lateFee.findFirst({
          where: {
            invoiceId: invoice.id,
            monthAffected: month.month,
            status: "ACTIVE"
          }
        });

        if (existingFee) {
          console.log(`Late fee already applied for ${month.month}`);
          continue;
        }

        // Calculate days overdue
        const daysOverdue = calculateDaysOverdue(month.dueDate);

        // Calculate late fee
        const feeAmount = calculateLateFee(
          parseFloat(month.baseAmount),
          daysOverdue,
          estate
        );

        // Only create a LateFee record if fee amount > 0
        if (feeAmount > 0) {
          const lateFee = await tx.lateFee.create({
            data: {
              invoiceId: invoice.id,
              estateId: user.estateId,
              monthAffected: month.month,
              daysOverdue,
              baseAmount: parseFloat(month.baseAmount),
              feeType: estate.lateFeeType,
              feeValue: estate.lateFeeValue,
              calculatedAmount: feeAmount,
              appliedToBalance: parseFloat(month.baseAmount),
              compoundingMethod: estate.lateFeeCompounding,
              status: "ACTIVE",
              appliedBy: appliedBy || "SYSTEM"
            }
          });

          // Update InvoiceMonth with late fee
          await tx.invoiceMonth.update({
            where: { id: month.id },
            data: {
              lateFee: feeAmount,
              lateFeeId: lateFee.id,
              lateFeeAppliedDate: new Date(),
              amountRemaining: parseFloat(month.baseAmount) + feeAmount - parseFloat(month.amountPaid || 0)
            }
          });

          feesApplied.push({
            monthAffected: month.month,
            daysOverdue,
            baseAmount: parseFloat(month.baseAmount),
            feeAmount,
            totalDue: parseFloat(month.baseAmount) + feeAmount
          });
        }
      }

      // Recalculate invoice totals
      if (feesApplied.length > 0) {
        const months = await tx.invoiceMonth.findMany({
          where: { invoiceId: invoice.id }
        });

        const totalLateFees = months.reduce((s, m) => s + parseFloat(m.lateFee || 0), 0);
        const newTotalDue = parseFloat(invoice.amount) + totalLateFees;
        const outstanding = Math.max(0, newTotalDue - parseFloat(invoice.totalPaid || 0));

        let newStatus = "PENDING";
        if (parseFloat(invoice.totalPaid || 0) >= newTotalDue) newStatus = "PAID";
        else if (parseFloat(invoice.totalPaid || 0) > 0) newStatus = "PARTIAL";
        else if (daysOverdue > 0) newStatus = "OVERDUE";

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            lateFee: totalLateFees,
            totalOutstanding: outstanding,
            status: newStatus,
            daysOverdue: calculateDaysOverdue(invoice.dueDate)
          }
        });
      }
    });

    // Fetch updated invoice
    const updated = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        monthlyCharges: { orderBy: { month: "asc" } },
        lateFees: { where: { status: "ACTIVE" } }
      }
    });

    return res.json({
      message: `Applied ${feesApplied.length} late fee(s)`,
      feesApplied,
      invoice: updated
    });
  } catch (err) {
    console.error("Apply late fees error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/invoices/:invoiceId/late-fees
// Returns all late fees for an invoice
// ═══════════════════════════════════════════════════════════════════════════════
const getInvoiceLateFees = async (req, res) => {
  const { invoiceId } = req.params;

  if (!invoiceId)
    return res.status(400).json({ error: "invoiceId is required" });

  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId)
      return res.status(400).json({ error: "User not linked to estate" });

    const invoice = await prisma.invoice.findFirst({
      where: { id: parseInt(invoiceId), estateId: user.estateId }
    });

    if (!invoice) 
      return res.status(404).json({ error: "Invoice not found" });

    const lateFees = await prisma.lateFee.findMany({
      where: { invoiceId: parseInt(invoiceId) },
      orderBy: { monthAffected: "asc" }
    });

    return res.json({
      invoiceId,
      lateFees: lateFees.map(fee => ({
        id: fee.id,
        monthAffected: fee.monthAffected,
        daysOverdue: fee.daysOverdue,
        baseAmount: parseFloat(fee.baseAmount),
        feeType: fee.feeType,
        feeValue: fee.feeValue,
        calculatedAmount: parseFloat(fee.calculatedAmount),
        status: fee.status,
        appliedDate: fee.appliedDate,
        appliedBy: fee.appliedBy,
        waivedDate: fee.waiveDate,
        waivedReason: fee.waivedReason
      }))
    });
  } catch (err) {
    console.error("Get invoice late fees error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/late-fees/:feeId/waive
// Waives (removes) a late fee
// ═══════════════════════════════════════════════════════════════════════════════
const waveLateFee = async (req, res) => {
  const { feeId } = req.params;
  const { reason } = req.body;

  if (!feeId)
    return res.status(400).json({ error: "feeId is required" });

  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId)
      return res.status(400).json({ error: "User not linked to estate" });

    const lateFee = await prisma.lateFee.findUnique({
      where: { id: feeId },
      include: { invoice: true }
    });

    if (!lateFee)
      return res.status(404).json({ error: "Late fee not found" });

    if (lateFee.estateId !== user.estateId)
      return res.status(403).json({ error: "Not authorized" });

    if (lateFee.status === "WAIVED")
      return res.status(400).json({ error: "Late fee is already waived" });

    // Waive the fee
    await prisma.$transaction(async (tx) => {
      await tx.lateFee.update({
        where: { id: feeId },
        data: {
          status: "WAIVED",
          waiveDate: new Date(),
          waivedReason: reason || null
        }
      });

      // Remove from invoice month
      await tx.invoiceMonth.updateMany({
        where: { lateFeeId: feeId },
        data: {
          lateFee: 0,
          lateFeeId: null,
          lateFeeAppliedDate: null
        }
      });

      // Recalculate invoice totals
      const months = await tx.invoiceMonth.findMany({
        where: { invoiceId: lateFee.invoiceId }
      });

      const totalLateFees = months.reduce((s, m) => s + parseFloat(m.lateFee || 0), 0);
      const newTotalDue = parseFloat(lateFee.invoice.amount) + totalLateFees;
      const outstanding = Math.max(0, newTotalDue - parseFloat(lateFee.invoice.totalPaid || 0));

      let newStatus = "PENDING";
      if (parseFloat(lateFee.invoice.totalPaid || 0) >= newTotalDue) newStatus = "PAID";
      else if (parseFloat(lateFee.invoice.totalPaid || 0) > 0) newStatus = "PARTIAL";

      await tx.invoice.update({
        where: { id: lateFee.invoiceId },
        data: {
          lateFee: totalLateFees,
          totalOutstanding: outstanding,
          status: newStatus
        }
      });
    });

    return res.json({ message: "Late fee waived successfully" });
  } catch (err) {
    console.error("Wave late fee error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// invoiceController - PHASE 4 PAYMENT ADDITIONS

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/invoices/:invoiceId/record-payment
// Records a payment and allocates using FIFO
// ═══════════════════════════════════════════════════════════════════════════════
const recordPayment = async (req, res) => {
  const { invoiceId } = req.params;
  const { amountPaid, paymentDate, method, receiptNo, notes } = req.body;

  // Validation
  if (!invoiceId || !amountPaid || !paymentDate || !method || !receiptNo) {
    return res.status(400).json({
      error: "invoiceId, amountPaid, paymentDate, method, and receiptNo are required"
    });
  }

  if (parseFloat(amountPaid) <= 0) {
    return res.status(400).json({ error: "amountPaid must be greater than 0" });
  }

  if (!["CASH", "M-PESA", "BANK_TRANSFER", "CHEQUE", "OTHER"].includes(method)) {
    return res.status(400).json({ error: "Invalid payment method" });
  }

  try {
    // Get user's estate
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId)
      return res.status(400).json({ error: "User not linked to estate" });

    // Record payment using FIFO
    const result = await recordPaymentWithFIFO(
      parseInt(invoiceId),
      parseFloat(amountPaid),
      new Date(paymentDate),
      method,
      receiptNo,
      notes || null,
      user.estateId
    );

    return res.status(201).json({
      message: "Payment recorded successfully",
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
        totalOutstanding: parseFloat(result.invoice.totalOutstanding),
        resident: result.invoice.resident.fullName,
        unit: result.invoice.unit.unitNumber
      },
      unallocated: result.unallocated > 0 ? result.unallocated : null
    });
  } catch (err) {
    console.error("Record payment error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/invoices/:invoiceId/preview-payment
// Preview payment allocation without recording
// ═══════════════════════════════════════════════════════════════════════════════
const previewPayment = async (req, res) => {
  const { invoiceId } = req.params;
  const { amountToPay } = req.body;

  if (!invoiceId || !amountToPay) {
    return res.status(400).json({
      error: "invoiceId and amountToPay are required"
    });
  }

  if (parseFloat(amountToPay) <= 0) {
    return res.status(400).json({ error: "amountToPay must be greater than 0" });
  }

  try {
    // Get user's estate
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId)
      return res.status(400).json({ error: "User not linked to estate" });

    // Get invoice with monthly charges
    const invoice = await prisma.invoice.findFirst({
      where: { id: parseInt(invoiceId), estateId: user.estateId },
      include: {
        monthlyCharges: { orderBy: { month: "asc" } },
        resident: { select: { id: true, fullName: true } }
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (invoice.monthlyCharges.length === 0) {
      return res.status(400).json({ error: "Invoice has no monthly breakdown" });
    }

    // Preview allocation
    const preview = previewPaymentAllocation(
      parseFloat(amountToPay),
      invoice.monthlyCharges
    );

    return res.json({
      preview: {
        invoiceId,
        resident: invoice.resident.fullName,
        amountToPay: preview.totalToPay,
        allocations: preview.allocations.map(a => ({
          month: a.month,
          baseAmount: a.baseAmount,
          lateFee: a.lateFee,
          currentlyPaid: a.alreadyPaid,
          willAllocate: a.willAllocate,
          willRemain: a.willRemain,
          willBePaid: a.willBePaid,
          willBeFullyPaid: a.willBePaid >= (a.baseAmount + a.lateFee)
        })),
        summary: {
          monthsBeingPaid: preview.summary.monthsPaying,
          totalAllocated: preview.summary.totalAllocated,
          unallocated: preview.summary.unallocated
        }
      }
    });
  } catch (err) {
    console.error("Preview payment error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/invoices/:invoiceId/payment-history
// Get all payments and allocations for an invoice
// ═══════════════════════════════════════════════════════════════════════════════
const getInvoicePaymentHistory = async (req, res) => {
  const { invoiceId } = req.params;

  if (!invoiceId) {
    return res.status(400).json({ error: "invoiceId is required" });
  }

  try {
    // Get user's estate
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId)
      return res.status(400).json({ error: "User not linked to estate" });

    // Verify invoice belongs to user's estate
    const invoice = await prisma.invoice.findFirst({
      where: { id: parseInt(invoiceId), estateId: user.estateId }
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Get payment history
    const history = await getPaymentHistory(parseInt(invoiceId));

    return res.json({
      invoiceId,
      payments: history
    });
  } catch (err) {
    console.error("Get payment history error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};



module.exports = {
  getInvoices,
  getOverdueInvoices,
  getInvoicesByResident,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  generateMonthlyInvoices,
  backfillInvoiceMonths,
  applyLateFees,
  getInvoiceLateFees,
  waveLateFee,
  recordPayment,
  previewPayment,
  getInvoicePaymentHistory
};
