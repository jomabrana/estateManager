const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { login, createUser, getLoggedInUser, linkEstate, logout, deleteUser } = require("../controllers/authController");

router.post("/login", login);// Public — no token needed
router.post("/create-user", protect, createUser);// Protected — check if user is logged in
router.get("/me", protect, getLoggedInUser);// Protected — must be logged in to create another user,This prevents anyone on the internet from creating accounts
router.post("/link-estate", protect, linkEstate);
router.post("/logout", protect, logout);// Protected — logout (discard token on client)
router.delete("/users/:id", protect, deleteUser);// Protected — delete user (self or admin can delete anyone)

module.exports = router;