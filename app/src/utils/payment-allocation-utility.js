// backend/src/utils/payment-allocation-utility.js
// FIFO Payment allocation and status update logic

const prisma = require("../../prisma/client");

/**
 * Allocate payment using FIFO (First In, First Out)
 * Pays off oldest months first
 * @param {number} amountToPay - Amount to allocate
 * @param {Array} invoiceMonths - Sorted invoice months (oldest first)
 * @returns {Array} Allocations: [{month, allocated, monthRemaining}]
 */
function allocatePaymentFIFO(amountToPay, invoiceMonths) {
  const allocations = [];
  let remaining = amountToPay;

  // invoiceMonths must be sorted by month (oldest first)
  const sorted = [...invoiceMonths].sort((a, b) => 
    a.month.localeCompare(b.month)
  );

  for (const month of sorted) {
    if (remaining <= 0) break;

    // Total due for this month = base + late fee - already paid
    const totalDue = parseFloat(month.baseAmount) + parseFloat(month.lateFee || 0);
    const alreadyPaid = parseFloat(month.amountPaid || 0);
    const monthRemaining = Math.max(0, totalDue - alreadyPaid);

    if (monthRemaining <= 0) {
      // Month already paid, skip
      continue;
    }

    // Allocate to this month
    const allocated = Math.min(remaining, monthRemaining);
    remaining -= allocated;

    allocations.push({
      month: month.month,
      allocated: Math.round(allocated * 100) / 100,
      monthRemaining: Math.max(0, monthRemaining - allocated),
      totalDue,
      alreadyPaid,
      baseAmount: parseFloat(month.baseAmount),
      lateFee: parseFloat(month.lateFee || 0)
    });
  }

  return {
    allocations,
    unallocated: Math.max(0, remaining)
  };
}

/**
 * Record a payment and allocate using FIFO
 * @param {number} invoiceId - Invoice ID
 * @param {number} amountPaid - Payment amount
 * @param {Date} paymentDate - Payment date
 * @param {string} method - Payment method (CASH, M-PESA, etc)
 * @param {string} receiptNo - Receipt number
 * @param {string} notes - Payment notes
 * @param {number} estateId - Estate ID
 * @returns {Object} {payment, allocations, invoice}
 */
async function recordPaymentWithFIFO(
  invoiceId,
  amountPaid,
  paymentDate,
  method,
  receiptNo,
  notes,
  estateId
) {
  try {
    // Get invoice with all monthly charges
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, estateId },
      include: {
        monthlyCharges: { orderBy: { month: "asc" } },
        payments: { select: { amountPaid: true } }
      }
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    if (invoice.monthlyCharges.length === 0) {
      throw new Error("Invoice has no monthly breakdown");
    }

    // Calculate FIFO allocation
    const allocationResult = allocatePaymentFIFO(
      amountPaid,
      invoice.monthlyCharges
    );

    if (allocationResult.allocations.length === 0) {
      throw new Error("No unallocated months found for this invoice");
    }

    // Record payment and allocations in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          estateId,
          amountPaid: parseFloat(amountPaid),
          paymentDate: new Date(paymentDate),
          method,
          receiptNo,
          notes: notes || null
        }
      });

      // Create allocation records and update invoice months
      const createdAllocations = [];

      for (const allocation of allocationResult.allocations) {
        // Create PaymentAllocation record
        const pa = await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            month: allocation.month,
            allocatedAmount: allocation.allocated
          }
        });

        createdAllocations.push({
          id: pa.id,
          month: allocation.month,
          allocated: allocation.allocated
        });

        // Update InvoiceMonth
        const invoiceMonth = invoice.monthlyCharges.find(m => m.month === allocation.month);
        if (invoiceMonth) {
          const newAmountPaid = parseFloat(invoiceMonth.amountPaid || 0) + allocation.allocated;
          const totalDue = parseFloat(invoiceMonth.baseAmount) + parseFloat(invoiceMonth.lateFee || 0);
          const newRemaining = Math.max(0, totalDue - newAmountPaid);

          let newStatus = "UNPAID";
          if (newAmountPaid >= totalDue) newStatus = "PAID";
          else if (newAmountPaid > 0) newStatus = "PARTIAL";

          await tx.invoiceMonth.update({
            where: { id: invoiceMonth.id },
            data: {
              amountPaid: newAmountPaid,
              amountRemaining: newRemaining,
              status: newStatus
            }
          });
        }
      }

      // Recalculate invoice totals
      const allMonths = await tx.invoiceMonth.findMany({
        where: { invoiceId }
      });

      const newTotalPaid = allMonths.reduce((sum, m) => 
        sum + parseFloat(m.amountPaid || 0), 0
      );
      const newTotalDue = allMonths.reduce((sum, m) => 
        sum + parseFloat(m.baseAmount || 0) + parseFloat(m.lateFee || 0), 0
      );
      const newOutstanding = Math.max(0, newTotalDue - newTotalPaid);

      let invoiceStatus = "PENDING";
      if (newTotalPaid >= newTotalDue) invoiceStatus = "PAID";
      else if (newTotalPaid > 0) invoiceStatus = "PARTIAL";
      else if (new Date(invoice.dueDate) < new Date()) invoiceStatus = "OVERDUE";

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          totalPaid: newTotalPaid,
          totalOutstanding: newOutstanding,
          status: invoiceStatus,
          lastPaymentDate: new Date(paymentDate)
        },
        include: {
          resident: { select: { id: true, fullName: true } },
          unit: { select: { id: true, unitNumber: true } },
          monthlyCharges: { orderBy: { month: "asc" } }
        }
      });

      return {
        payment,
        allocations: createdAllocations,
        invoice: updatedInvoice,
        unallocated: allocationResult.unallocated
      };
    });

    return result;
  } catch (err) {
    console.error("Record payment error:", err);
    throw err;
  }
}

/**
 * Preview payment allocation without recording
 * Shows what will be allocated
 */
function previewPaymentAllocation(amountPaid, invoiceMonths) {
  const result = allocatePaymentFIFO(amountPaid, invoiceMonths);
  
  return {
    totalToPay: amountPaid,
    allocations: result.allocations.map(a => ({
      month: a.month,
      baseAmount: a.baseAmount,
      lateFee: a.lateFee,
      alreadyPaid: a.alreadyPaid,
      willAllocate: a.allocated,
      willRemain: a.monthRemaining,
      willBePaid: a.alreadyPaid + a.allocated
    })),
    unallocated: result.unallocated,
    summary: {
      monthsPaying: result.allocations.length,
      totalAllocated: amountPaid - result.unallocated,
      unallocated: result.unallocated
    }
  };
}

/**
 * Get payment history for an invoice
 */
async function getPaymentHistory(invoiceId) {
  const payments = await prisma.payment.findMany({
    where: { invoiceId },
    include: {
      allocations: { orderBy: { month: "asc" } }
    },
    orderBy: { paymentDate: "desc" }
  });

  return payments.map(p => ({
    id: p.id,
    amount: parseFloat(p.amountPaid),
    method: p.method,
    receiptNo: p.receiptNo,
    date: p.paymentDate,
    notes: p.notes,
    allocations: p.allocations.map(a => ({
      month: a.month,
      amount: parseFloat(a.allocatedAmount)
    }))
  }));
}

module.exports = {
  allocatePaymentFIFO,
  recordPaymentWithFIFO,
  previewPaymentAllocation,
  getPaymentHistory
};