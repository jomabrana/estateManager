const prisma = require("../../prisma/client");

async function requireEstateId(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { estateId: true }
  });
  if (!user?.estateId) throw new Error("NO_ESTATE");
  return user.estateId;
}

// Sync estate.numberOfUnits to actual unit count if actual count exceeds stored value
async function syncEstateUnitCount(estateId) {
  const actual = await prisma.unit.count({ where: { estateId } });
  const estate = await prisma.estate.findUnique({
    where: { id: estateId },
    select: { numberOfUnits: true }
  });
  if (actual > estate.numberOfUnits) {
    await prisma.estate.update({
      where: { id: estateId },
      data: { numberOfUnits: actual }
    });
  }
}

// ─── CREATE UNIT ─────────────────────────────────────────────
const createUnit = async (req, res) => {
  const { unitNumber, monthlyCharge } = req.body;
  if (!unitNumber || monthlyCharge === undefined)
    return res.status(400).json({ error: "unitNumber and monthlyCharge are required" });

  try {
    const estateId = await requireEstateId(req.user.userId);

    // Deduplication: block duplicate unit number within estate
    const existing = await prisma.unit.findFirst({ where: { estateId, unitNumber } });
    if (existing)
      return res.status(409).json({ error: `Unit "${unitNumber}" already exists in this estate` });

    const unit = await prisma.unit.create({
      data: { estateId, unitNumber, monthlyCharge: parseFloat(monthlyCharge) }
    });

    await syncEstateUnitCount(estateId);

    return res.status(201).json({ message: "Unit created", unit });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Create unit error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET ALL UNITS ────────────────────────────────────────────
const getUnits = async (req, res) => {
  try {
    const estateId = await requireEstateId(req.user.userId);

    const [units, estate] = await Promise.all([
      prisma.unit.findMany({
        where: { estateId },
        include: {
          residents: {
            where: { isActive: true },
            select: {
              id: true, fullName: true, emails: true,
              phones: true, type: true, isActive: true, moveInDate: true, notes: true
            }
          }
        },
        orderBy: { unitNumber: "asc" }
      }),
      prisma.estate.findUnique({
        where: { id: estateId },
        select: { numberOfUnits: true }
      })
    ]);

    return res.json({ units, estateNumberOfUnits: estate.numberOfUnits });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get units error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET SINGLE UNIT ──────────────────────────────────────────
const getUnit = async (req, res) => {
  try {
    const estateId = await requireEstateId(req.user.userId);
    const unit = await prisma.unit.findFirst({
      where: { id: parseInt(req.params.id), estateId },
      include: {
        residents: {
          select: {
            id: true, fullName: true, emails: true,
            phones: true, type: true, isActive: true, moveInDate: true, notes: true
          }
        }
      }
    });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    return res.json({ unit });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get unit error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── UPDATE UNIT ──────────────────────────────────────────────
const updateUnit = async (req, res) => {
  const { unitNumber, monthlyCharge } = req.body;
  try {
    const estateId = await requireEstateId(req.user.userId);
    const unit = await prisma.unit.findFirst({
      where: { id: parseInt(req.params.id), estateId }
    });
    if (!unit) return res.status(404).json({ error: "Unit not found" });

    // Deduplication: block changing to a unit number that already exists
    if (unitNumber && unitNumber !== unit.unitNumber) {
      const conflict = await prisma.unit.findFirst({
        where: { estateId, unitNumber, NOT: { id: unit.id } }
      });
      if (conflict)
        return res.status(409).json({ error: `Unit "${unitNumber}" already exists in this estate` });
    }

    const data = {};
    if (unitNumber !== undefined) data.unitNumber = unitNumber;
    if (monthlyCharge !== undefined) data.monthlyCharge = parseFloat(monthlyCharge);

    const updated = await prisma.unit.update({ where: { id: unit.id }, data });
    return res.json({ message: "Unit updated", unit: updated });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Update unit error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── DELETE UNIT ──────────────────────────────────────────────
const deleteUnit = async (req, res) => {
  try {
    const estateId = await requireEstateId(req.user.userId);
    const unit = await prisma.unit.findFirst({
      where: { id: parseInt(req.params.id), estateId }
    });
    if (!unit) return res.status(404).json({ error: "Unit not found" });

    await prisma.unit.delete({ where: { id: unit.id } });

    // After deletion sync count (don't bump up, only reflects actual)
    const actual = await prisma.unit.count({ where: { estateId } });
    await prisma.estate.update({
      where: { id: estateId },
      data: { numberOfUnits: actual }
    });

    return res.json({ message: "Unit deleted" });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Delete unit error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { createUnit, getUnits, getUnit, updateUnit, deleteUnit };

module.exports = { createUnit, getUnits, getUnit, updateUnit, deleteUnit };