const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

// Controllers
const { createEstate, getEstates, getEstate, updateEstate, deleteEstate } = require("../controllers/estateController");
const { createUnit, getUnits, getUnit, updateUnit, deleteUnit } = require("../controllers/unitController");
const { createTenant, getTenants, getTenant, updateTenant, deleteTenant } = require("../controllers/tenantController");
const { registerUrls, validatePayment, confirmPayment, getPayments, createPayment } = require("../controllers/paymentController");
const {
  getInvoices,
  getOverdueInvoices,
  getInvoicesByResident,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  generateMonthlyInvoices,
  backfillInvoiceMonths
} = require("../controllers/invoiceController");
const { getCommunications, getCommunicationHistory, sendManualCommunication, getCommunicationQueue, retryCommunication } = require('../controllers/communicationLogController');

// ═══════════════════════════════════════════════════════════════════════════════
// ESTATE
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/estates", protect, createEstate);
router.get("/estates", protect, getEstates);
router.get("/estates/:id", protect, getEstate);
router.put("/estates/:id", protect, updateEstate);
router.delete("/estates/:id", protect, deleteEstate);

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

// ═══════════════════════════════════════════════════════════════════════════════
// COMMUNICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
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