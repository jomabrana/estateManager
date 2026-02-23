// backend/src/controllers/authController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../../prisma/client");

// ─── LOGIN ───────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password }
// Returns: { token, user: { id, fullName, email, role } }
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    // Compare submitted password against hashed password in DB
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "Invalid email or password" });

    // Sign JWT — expires in 7 days
    // Payload carries userId and role for use in middleware
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── CREATE USER ─────────────────────────────────────────
// POST /api/auth/create-user
// Protected — only existing admins can create new users
// Body: { fullName, email, password }
const createUser = async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ error: "A user with this email already exists" });

    // Hash password before storing — never store plain text
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashed,
        role: "admin", // all users are admins by default
      },
    });

    return res.status(201).json({
      message: "User created successfully",
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Create user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { login, createUser };