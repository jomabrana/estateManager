// backend/src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

// Attach this to any route you want to protect.
// Usage in routes: router.get("/protected", protect, controller)
//
// Expects header: Authorization: Bearer <token>
// On success: attaches decoded user { userId, role } to req.user
// On failure: returns 401

const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check header exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided. Please log in." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role, iat, exp }
    next();
  } catch (err) {
    // Token is expired or tampered with
    return res.status(401).json({ error: "Invalid or expired token. Please log in again." });
  }
};

module.exports = { protect };