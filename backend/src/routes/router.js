// backend/src/routes/resourceRoutes.js
const express = require("express");
const router = express.Router();

// Import middleware
const { protect } = require("../middleware/authMiddleware");

// Import controllers
const {
  createEstate,
  getEstates,
  getEstate,
  updateEstate,
  deleteEstate,
} = require("../controllers/estateController");

const {
  createUnit,
  getUnits,
  getUnit,
  updateUnit,
  deleteUnit,
} = require("../controllers/unitController");

const {
  createTenant,
  getTenants,
  getTenant,
  updateTenant,
  deleteTenant,
} = require("../controllers/tenantController");

const {
  createPayment,
  getPayments,
  getPayment,
  updatePayment,
  deletePayment,
} = require("../controllers/paymentController");

const {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
} = require("../controllers/invoiceController");

const {
  createCommunicationLog,
  getCommunicationLogs,
  getCommunicationLog,
  updateCommunicationLog,
  deleteCommunicationLog,
} = require("../controllers/communicationLogController");

// ═══════════════════════════════════════════════════════════════════════
// ESTATE ROUTES
// ═══════════════════════════════════════════════════════════════════════
router.post("/estates", protect, createEstate);        // Create new estate
router.get("/estates", protect, getEstates);           // Get all estates
router.get("/estates/:id", protect, getEstate);        // Get single estate
router.put("/estates/:id", protect, updateEstate);     // Update estate
router.delete("/estates/:id", protect, deleteEstate);  // Delete estate

// ═══════════════════════════════════════════════════════════════════════
// UNIT ROUTES
// ═══════════════════════════════════════════════════════════════════════
router.post("/units", protect, createUnit);            // Create new unit
router.get("/units", protect, getUnits);               // Get all units
router.get("/units/:id", protect, getUnit);            // Get single unit
router.put("/units/:id", protect, updateUnit);         // Update unit
router.delete("/units/:id", protect, deleteUnit);      // Delete unit

// ═══════════════════════════════════════════════════════════════════════
// TENANT ROUTES
// ═══════════════════════════════════════════════════════════════════════
router.post("/tenants", protect, createTenant);        // Create new tenant
router.get("/tenants", protect, getTenants);           // Get all tenants
router.get("/tenants/:id", protect, getTenant);        // Get single tenant
router.put("/tenants/:id", protect, updateTenant);     // Update tenant
router.delete("/tenants/:id", protect, deleteTenant);  // Delete tenant

// ═══════════════════════════════════════════════════════════════════════
// PAYMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════
router.post("/payments", protect, createPayment);      // Create new payment
router.get("/payments", protect, getPayments);         // Get all payments
router.get("/payments/:id", protect, getPayment);      // Get single payment
router.put("/payments/:id", protect, updatePayment);   // Update payment
router.delete("/payments/:id", protect, deletePayment);// Delete payment

// ═══════════════════════════════════════════════════════════════════════
// INVOICE ROUTES
// ═══════════════════════════════════════════════════════════════════════
router.post("/invoices", protect, createInvoice);      // Create new invoice
router.get("/invoices", protect, getInvoices);         // Get all invoices
router.get("/invoices/:id", protect, getInvoice);      // Get single invoice
router.put("/invoices/:id", protect, updateInvoice);   // Update invoice
router.delete("/invoices/:id", protect, deleteInvoice);// Delete invoice

// ═══════════════════════════════════════════════════════════════════════
// COMMUNICATION LOG ROUTES
// ═══════════════════════════════════════════════════════════════════════
router.post("/communication-logs", protect, createCommunicationLog);      // Create new log
router.get("/communication-logs", protect, getCommunicationLogs);         // Get all logs
router.get("/communication-logs/:id", protect, getCommunicationLog);      // Get single log
router.put("/communication-logs/:id", protect, updateCommunicationLog);   // Update log
router.delete("/communication-logs/:id", protect, deleteCommunicationLog);// Delete log

module.exports = router;