const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../../prisma/client");

// ─── CREATE USER ─────────────────────────────────────────
const createUser = async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ error: "A user with this email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    // Inherit the creating admin's estateId so the new user is linked to the same estate
    const creatingUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { estateId: true }
    });

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashed,
        role: "admin",
        estateId: creatingUser?.estateId || null,
      },
    });

    return res.status(201).json({
      message: "User created successfully",
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Create user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── LOGIN ───────────────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET LOGGED IN USER ──────────────────────────────────
// Now includes estateId + estate name so the frontend can gate the dashboard
const getLoggedInUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
        estateId: true,
        estate: {
          select: { id: true, name: true, location: true }
        },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({ user });
  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── LINK ESTATE ─────────────────────────────────────────
// POST /api/auth/link-estate
// Body: { estateId }
// Links the logged-in user to an existing estate
const linkEstate = async (req, res) => {
  const { estateId } = req.body;

  if (!estateId)
    return res.status(400).json({ error: "estateId is required" });

  try {
    const estate = await prisma.estate.findUnique({ where: { id: parseInt(estateId) } });
    if (!estate)
      return res.status(404).json({ error: "Estate not found" });

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { estateId: parseInt(estateId) },
      select: { id: true, fullName: true, email: true, role: true, estateId: true }
    });

    return res.json({ message: "Estate linked successfully", user });
  } catch (err) {
    console.error("Link estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── LOGOUT ──────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    return res.json({ message: "Logout successful. Please discard your token." });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── DELETE USER ─────────────────────────────────────────
const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!id) return res.status(400).json({ error: "User ID is required" });

  try {
    const userId = parseInt(id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (req.user.userId !== userId && req.user.role !== "admin")
      return res.status(403).json({ error: "Cannot delete other users" });

    await prisma.user.delete({ where: { id: userId } });

    return res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { login, createUser, getLoggedInUser, linkEstate, logout, deleteUser };