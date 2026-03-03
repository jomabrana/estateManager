// backend/src/controllers/estateController.js
const prisma = require("../../prisma/client");

// ─── CREATE ESTATE ───────────────────────────────────────────
// POST /api/estates
// Protected — requires valid JWT token (admin only)
// Body: { name, location, description, numberOfUnits }
// Returns: { message, estate: {...} }
const createEstate = async (req, res) => {
  const { name, location, description, numberOfUnits } = req.body;

  // Validation
  if (!name || !location)
    return res.status(400).json({ error: "Name and location are required" });

  try {
    // Check if estate already exists
    const existing = await prisma.estate.findFirst({
      where: { name }
    });
    if (existing)
      return res.status(409).json({ error: "Estate with this name already exists" });

    // Create estate
    const estate = await prisma.estate.create({
      data: {
        name,
        location,
        description: description || null,
        numberOfUnits: numberOfUnits || 0,
      }
    });

    return res.status(201).json({
      message: "Estate created successfully",
      estate: {
        id: estate.id,
        name: estate.name,
        location: estate.location,
        description: estate.description,
        numberOfUnits: estate.numberOfUnits,
        createdAt: estate.createdAt,
      }
    });
  } catch (err) {
    console.error("Create estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET ALL ESTATES ───────────────────────────────────────────
// GET /api/estates
// Protected — requires valid JWT token
// Returns: { estates: [...] }
const getEstates = async (req, res) => {
  try {
    const estates = await prisma.estate.findMany({
      select: {
        id: true,
        name: true,
        location: true,
        description: true,
        numberOfUnits: true,
        createdAt: true,
      }
    });

    return res.json({ estates });
  } catch (err) {
    console.error("Get estates error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET SINGLE ESTATE ───────────────────────────────────────────
// GET /api/estates/:id
// Protected — requires valid JWT token
// Returns: { estate: {...} }
const getEstate = async (req, res) => {
  const { id } = req.params;

  if (!id)
    return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estateId = parseInt(id);
    const estate = await prisma.estate.findUnique({
      where: { id: estateId },
      select: {
        id: true,
        name: true,
        location: true,
        description: true,
        numberOfUnits: true,
        createdAt: true,
      }
    });

    if (!estate)
      return res.status(404).json({ error: "Estate not found" });

    return res.json({ estate });
  } catch (err) {
    console.error("Get estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── UPDATE ESTATE ───────────────────────────────────────────
// PUT /api/estates/:id
// Protected — requires valid JWT token (admin only)
// Body: { name, location, description, numberOfUnits } (partial update OK)
// Returns: { message, estate: {...} }
const updateEstate = async (req, res) => {
  const { id } = req.params;
  const { name, location, description, numberOfUnits } = req.body;

  if (!id)
    return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estateId = parseInt(id);

    // Check if estate exists
    const estate = await prisma.estate.findUnique({ where: { id: estateId } });
    if (!estate)
      return res.status(404).json({ error: "Estate not found" });

    // Build update data (only include provided fields)
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (location !== undefined) updateData.location = location;
    if (description !== undefined) updateData.description = description;
    if (numberOfUnits !== undefined) updateData.numberOfUnits = numberOfUnits;

    // Update estate
    const updated = await prisma.estate.update({
      where: { id: estateId },
      data: updateData,
      select: {
        id: true,
        name: true,
        location: true,
        description: true,
        numberOfUnits: true,
        createdAt: true,
      }
    });

    return res.json({
      message: "Estate updated successfully",
      estate: updated
    });
  } catch (err) {
    console.error("Update estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── DELETE ESTATE ───────────────────────────────────────────
// DELETE /api/estates/:id
// Protected — requires valid JWT token (admin only)
// Returns: { message: "Estate deleted successfully" }
const deleteEstate = async (req, res) => {
  const { id } = req.params;

  if (!id)
    return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estateId = parseInt(id);

    // Check if estate exists
    const estate = await prisma.estate.findUnique({ where: { id: estateId } });
    if (!estate)
      return res.status(404).json({ error: "Estate not found" });

    // Delete estate (this will cascade delete related records if configured in schema)
    await prisma.estate.delete({ where: { id: estateId } });

    return res.json({ message: "Estate deleted successfully" });
  } catch (err) {
    console.error("Delete estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  createEstate,
  getEstates,
  getEstate,
  updateEstate,
  deleteEstate
};