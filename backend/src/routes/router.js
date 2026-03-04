const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  createEstate,
  getEstates,
  getEstate,
  updateEstate,
  deleteEstate,
} = require("../controllers/estateController");

// ── ESTATE ROUTES ──────────────────────────────────────────────
router.post("/estates", protect, createEstate);
router.get("/estates", protect, getEstates);
router.get("/estates/:id", protect, getEstate);
router.put("/estates/:id", protect, updateEstate);
router.delete("/estates/:id", protect, deleteEstate);

// TODO: add unit, tenant, payment, invoice, communication routes
// once their controllers are created

module.exports = router;