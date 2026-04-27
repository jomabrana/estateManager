const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

// Controllers
const { 
  createEstate, getEstates, getEstate, updateEstate, deleteEstate,  getLateFeeConfig, updateLateFeeConfig 
} = require("../controllers/estateController");

const { createUnit, getUnits, getUnit, updateUnit, deleteUnit } = require("../controllers/unitController");
const { createTenant, getTenants, getTenant, updateTenant, deleteTenant } = require("../controllers/tenantController");
const { registerUrls, validatePayment, confirmPayment, getPayments, createPayment,getPaymentById ,getPaymentAllocations  } = require("../controllers/paymentController");
const {
  getInvoices,  getOverdueInvoices,  getInvoicesByResident,  getInvoice,  createInvoice,  updateInvoice,  deleteInvoice,  generateMonthlyInvoices,  backfillInvoiceMonths,
  applyLateFees,            getInvoiceLateFees,         waveLateFee,              // Phase 3
  recordPayment,              previewPayment,             getInvoicePaymentHistory  // Phase 4
} = require("../controllers/invoiceController");
const { getCommunications, getCommunicationHistory, sendManualCommunication, getCommunicationQueue, retryCommunication, getResidentsSummary } = require('../controllers/communicationLogController');

// ═══════════════════════════════════════════════════════════════════════════════
// ESTATE
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/estates", protect, createEstate);
router.get("/estates", protect, getEstates);
router.get("/estates/:id", protect, getEstate);
router.put("/estates/:id", protect, updateEstate);
router.delete("/estates/:id", protect, deleteEstate);
router.get("/estates/:id/late-fee-config", protect, getLateFeeConfig);
router.put("/estates/:id/late-fee-config", protect, updateLateFeeConfig);

// ═══════════════════════════════════════════════════════════════════════════════
// UNITS
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/units", protect, createUnit);
router.get("/units", protect, getUnits);
router.get("/units/:id", protect, getUnit);
router.put("/units/:id", protect, updateUnit);
router.delete("/units/:id", protect, deleteUnit);

// ═══════════════════════════════════════════════════════════════════════════════
// TENANTS / RESIDENTS
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/tenants", protect, createTenant);
router.get("/tenants", protect, getTenants);
router.get("/tenants/:id", protect, getTenant);
router.put("/tenants/:id", protect, updateTenant);
router.delete("/tenants/:id", protect, deleteTenant);

// ── PAYMENTS ──────────────────────────────────────────────────
// Specific routes BEFORE wildcard routes
router.get("/payments",                protect, getPayments);
router.post("/payments",               protect, createPayment);
router.post("/payments/register-urls", protect, registerUrls);
// GET single payment with full details
router.get('/payments/:id', protect, getPaymentById);
 
// GET payment allocation breakdown
router.get('/payments/:id/allocations', protect, getPaymentAllocations);
 

// M-PESA callbacks — NO protect middleware (Safaricom calls these directly)
router.post("/payments/validate", validatePayment);
router.post("/payments/confirm",  confirmPayment);



// ── INVOICES ──────────────────────────────────────────────────
// CRITICAL: all static routes MUST come before /:id
router.get("/invoices",                      protect, getInvoices);
router.get("/invoices/overdue",              protect, getOverdueInvoices);
router.get("/invoices/resident/:residentId", protect, getInvoicesByResident);
router.post("/invoices",                     protect, createInvoice);
router.post("/invoices/generate-monthly",    protect, generateMonthlyInvoices);
router.post("/invoices/backfill-months",     protect, backfillInvoiceMonths);
router.get("/invoices/:id",                  protect, getInvoice);
router.put("/invoices/:id",                  protect, updateInvoice);
router.delete("/invoices/:id",               protect, deleteInvoice);

// PHASE 3: Late Fees
router.post("/invoices/:invoiceId/apply-late-fees", protect, applyLateFees);
router.get("/invoices/:invoiceId/late-fees", protect, getInvoiceLateFees);
router.post("/late-fees/:feeId/waive", protect, waveLateFee);

// PHASE 4: Payment Recording & FIFO Allocation
router.post("/invoices/:invoiceId/preview-payment", protect, previewPayment);
router.post("/invoices/:invoiceId/record-payment", protect, recordPayment);
router.get("/invoices/:invoiceId/payment-history", protect, getInvoicePaymentHistory);

// ═══════════════════════════════════════════════════════════════════════════════
// COMMUNICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
// GET: Residents with invoice status + total owing (for targeting)
router.get("/communications/residents-summary", protect, getResidentsSummary);

// GET: List all communications
router.get("/communications", protect, getCommunications);

// GET: Get communication history for invoice
router.get("/communications/:invoiceId", protect, getCommunicationHistory);

// POST: Send manual communication (admin)
router.post("/communications/send-manual", protect, sendManualCommunication);

// GET: Get pending/failed communications (queue)
router.get("/communications/queue", protect, getCommunicationQueue);

// POST: Retry failed communication
router.post("/communications/:id/retry", protect, retryCommunication);

module.exports = router;
