
const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const { createEstate, getEstates, getEstate, updateEstate, deleteEstate } = require("../controllers/estateController");
const { createUnit, getUnits, getUnit, updateUnit, deleteUnit } = require("../controllers/unitController");
const { createTenant, getTenants, getTenant, updateTenant, deleteTenant } = require("../controllers/tenantController");

// ── ESTATE ────────────────────────────────────────────────────
router.post("/estates",     protect, createEstate);
router.get("/estates",      protect, getEstates);
router.get("/estates/:id",  protect, getEstate);
router.put("/estates/:id",  protect, updateEstate);
router.delete("/estates/:id", protect, deleteEstate);

// ── UNITS ─────────────────────────────────────────────────────
router.post("/units",      protect, createUnit);
router.get("/units",       protect, getUnits);
router.get("/units/:id",   protect, getUnit);
router.put("/units/:id",   protect, updateUnit);
router.delete("/units/:id",protect, deleteUnit);

// ── TENANTS / RESIDENTS ───────────────────────────────────────
router.post("/tenants",       protect, createTenant);
router.get("/tenants",        protect, getTenants);
router.get("/tenants/:id",    protect, getTenant);
router.put("/tenants/:id",    protect, updateTenant);
router.delete("/tenants/:id", protect, deleteTenant);

module.exports = router;


// TODO:  payment, invoice, communication routes
// once their controllers are created