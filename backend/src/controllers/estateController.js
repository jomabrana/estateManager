const prisma = require("../../prisma/client");

// ─── CREATE ESTATE ───────────────────────────────────────────
// POST /api/estates
// Auto-links the creating user to the new estate
const createEstate = async (req, res) => {
  const { name, location, description, numberOfUnits } = req.body;

  if (!name || !location)
    return res.status(400).json({ error: "Name and location are required" });

  try {
    const existing = await prisma.estate.findFirst({ where: { name } });
    if (existing)
      return res.status(409).json({ error: "Estate with this name already exists" });

    // Create estate and immediately link creating user in a transaction
    const [estate] = await prisma.$transaction([
      prisma.estate.create({
        data: {
          name,
          location,
          description: description || null,
          numberOfUnits: numberOfUnits ? parseInt(numberOfUnits) : 0,
        }
      })
    ]);

    // Link this user to the newly created estate
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { estateId: estate.id }
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

// ─── GET ALL ESTATES ─────────────────────────────────────────
const getEstates = async (req, res) => {
  try {
    const estates = await prisma.estate.findMany({
      select: { id: true, name: true, location: true, description: true, numberOfUnits: true, createdAt: true }
    });
    return res.json({ estates });
  } catch (err) {
    console.error("Get estates error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET SINGLE ESTATE ───────────────────────────────────────
const getEstate = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estate = await prisma.estate.findUnique({
      where: { id: parseInt(id) },
      select: { id: true, name: true, location: true, description: true, numberOfUnits: true, createdAt: true }
    });
    if (!estate) return res.status(404).json({ error: "Estate not found" });
    return res.json({ estate });
  } catch (err) {
    console.error("Get estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── UPDATE ESTATE ───────────────────────────────────────────
const updateEstate = async (req, res) => {
  const { id } = req.params;
  const { name, location, description, numberOfUnits } = req.body;

  if (!id) return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estate = await prisma.estate.findUnique({ where: { id: parseInt(id) } });
    if (!estate) return res.status(404).json({ error: "Estate not found" });

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (location !== undefined) updateData.location = location;
    if (description !== undefined) updateData.description = description;
    if (numberOfUnits !== undefined) updateData.numberOfUnits = parseInt(numberOfUnits);

    const updated = await prisma.estate.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: { id: true, name: true, location: true, description: true, numberOfUnits: true, createdAt: true }
    });

    return res.json({ message: "Estate updated successfully", estate: updated });
  } catch (err) {
    console.error("Update estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── DELETE ESTATE ───────────────────────────────────────────
const deleteEstate = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estate = await prisma.estate.findUnique({ where: { id: parseInt(id) } });
    if (!estate) return res.status(404).json({ error: "Estate not found" });

    await prisma.estate.delete({ where: { id: parseInt(id) } });
    return res.json({ message: "Estate deleted successfully" });
  } catch (err) {
    console.error("Delete estate error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { createEstate, getEstates, getEstate, updateEstate, deleteEstate };