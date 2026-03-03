// backend/src/controllers/authController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../../prisma/client");

// ─── CREATE USER ─────────────────────────────────────────
// POST /api/auth/create-user
// Protected — only existing admins can create new users
// Body: { fullName, email, password }
const createUser = async (req, res) => {
  const { fullName, email, password, role='admin' } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ error: "A user with this email already exists" });

    // Hash password before storing in DB
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

// ─── CHECK LOGGED IN USER ───────────────────────────────────────────────
// GET /api/auth/me
// Protected — requires valid JWT token
// Returns: { user: { id, fullName, email, role } }
const getLoggedInUser = async (req, res) => {
  try {
    // req.user is set by protect middleware
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user });
  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};



// ─── LOGOUT ────────────────────────────────────────────────
// POST /api/auth/logout
// Protected — requires valid JWT token
// Returns: { message: "Logout successful" }
const logout = async (req, res) => {
  try {
    // JWT is stateless, so logout just means discard token on client
    // If you want to blacklist tokens, you'd track them in DB or Redis
    return res.json({ message: "Logout successful. Please discard your token." });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── DELETE USER ───────────────────────────────────────────
// DELETE /api/auth/users/:id
// Protected — requires valid JWT token
// Authorization: user can delete own account, admin can delete anyone
// Returns: { message: "User deleted successfully" }
const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const userId = parseInt(id);

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Authorization check: user can delete own account, admin can delete anyone
    if (req.user.userId !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "Cannot delete other users" });
    }

    // Delete user from database
    await prisma.user.delete({ where: { id: userId } });

    return res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { login, createUser, getLoggedInUser, logout, deleteUser };