// backend/src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { login, createUser, getLoggedInUser, logout, deleteUser } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public — no token needed
router.post("/login", login);

// Protected — check if user is logged in
router.get("/me", protect, getLoggedInUser);

// Protected — must be logged in to create another user
// This prevents anyone on the internet from creating accounts
router.post("/create_user", protect, createUser);


// Protected — logout (discard token on client)
router.post("/logout", protect, logout);

// Protected — delete user (self or admin can delete anyone)
router.delete("/users/:id", protect, deleteUser);

module.exports = router;