// backend/src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { login, createUser } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public — no token needed
router.post("/login", login);

// Protected — must be logged in to create another user
// This prevents anyone on the internet from creating accounts
router.post("/create_user", protect, createUser);

module.exports = router;