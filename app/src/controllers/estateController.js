//estate controller - UPDATED FOR PHASE 3
const prisma = require("../../prisma/client");

// ─── HELPERS ─────────────────────────────────────────────────

// Generate unit records "Unit 1" … "Unit N" for a given estate.
async function generateUnits(tx, estateId, from, to, monthlyCharge) {
  if (from > to) return;
  const data = [];
  for (let i = from; i <= to; i++) {
    data.push({
      estateId,
      unitNumber: `Unit ${i}`,
      monthlyCharge: parseFloat(monthlyCharge)
    });
  }
  await tx.unit.createMany({ data });
}

// ─── CREATE ESTATE ───────────────────────────────────────────
const createEstate = async (req, res) => {
  const { name, location, description, numberOfUnits, defaultMonthlyCharge } = req.body;

  if (!name || !location)
    return res.status(400).json({ error: "Name and location are required" });

  const unitCount = numberOfUnits ? parseInt(numberOfUnits) : 0;
  const charge    = defaultMonthlyCharge ? parseFloat(defaultMonthlyCharge) : 0;

  if (unitCount > 0 && charge <= 0)
    return res.status(400).json({ error: "A default monthly charge is required when creating units" });

  try {
    const existing = await prisma.estate.findFirst({ where: { name } });
    if (existing)
      return res.status(409).json({ error: "Estate with this name already exists" });

    const estate = await prisma.$transaction(async (tx) => {
      const created = await tx.estate.create({
        data: {
          name,
          location,
          description:          description || null,
          numberOfUnits:        unitCount,
          defaultMonthlyCharge: charge
        }
      });

      if (unitCount > 0) {
        await generateUnits(tx, created.id, 1, unitCount, charge);
      }

      return created;
    });

    await prisma.user.update({
      where: { id: req.user.userId },
      data:  { estateId: estate.id }
    });

    return res.status(201).json({
      message: "Estate created successfully",
      estate: {
        id:                   estate.id,
        name:                 estate.name,
        location:             estate.location,
        description:          estate.description,
        numberOfUnits:        estate.numberOfUnits,
        defaultMonthlyCharge: parseFloat(estate.defaultMonthlyCharge),
        createdAt:            estate.createdAt
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
      select: {
        id: true, name: true, location: true, description: true,
        numberOfUnits: true, defaultMonthlyCharge: true, createdAt: true
      }
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
      select: {
        id: true, name: true, location: true, description: true,
        numberOfUnits: true, defaultMonthlyCharge: true, createdAt: true
      }
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
  const { name, location, description, numberOfUnits, defaultMonthlyCharge } = req.body;

  if (!id) return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estate = await prisma.estate.findUnique({
      where: { id: parseInt(id) }
    });
    if (!estate) return res.status(404).json({ error: "Estate not found" });

    const newCount    = numberOfUnits  !== undefined ? parseInt(numberOfUnits)         : null;
    const newCharge   = defaultMonthlyCharge !== undefined ? parseFloat(defaultMonthlyCharge) : null;
    const targetCount = newCount !== null ? newCount : estate.numberOfUnits;

    if (newCount !== null && newCount !== estate.numberOfUnits) {
      const currentUnits = await prisma.unit.findMany({
        where: { estateId: parseInt(id) },
        include: {
          residents: { where: { isActive: true }, select: { id: true } }
        },
        orderBy: { id: "asc" }
      });

      const currentCount = currentUnits.length;

      if (newCount > currentCount) {
        const chargeToUse = newCharge ?? parseFloat(estate.defaultMonthlyCharge);
        await prisma.$transaction(async (tx) => {
          await generateUnits(tx, parseInt(id), currentCount + 1, newCount, chargeToUse);
        });

      } else if (newCount < currentCount) {
        const toRemove  = currentCount - newCount;

        const vacantFromEnd = [...currentUnits]
          .reverse()
          .filter(u => u.residents.length === 0);

        if (vacantFromEnd.length < toRemove) {
          const occupiedBlocking = toRemove - vacantFromEnd.length;
          return res.status(409).json({
            error: `Cannot reduce to ${newCount} units — ${occupiedBlocking} of the units that would be removed still have active residents.`
          });
        }

        const unitIdsToDelete = vacantFromEnd.slice(0, toRemove).map(u => u.id);
        await prisma.unit.deleteMany({ where: { id: { in: unitIdsToDelete } } });
      }
    }

    const updateData = {};
    if (name         !== undefined) updateData.name         = name;
    if (location     !== undefined) updateData.location     = location;
    if (description  !== undefined) updateData.description  = description;
    if (newCount     !== null)      updateData.numberOfUnits = targetCount;
    if (newCharge    !== null)      updateData.defaultMonthlyCharge = newCharge;

    const updated = await prisma.estate.update({
      where: { id: parseInt(id) },
      data:  updateData,
      select: {
        id: true, name: true, location: true, description: true,
        numberOfUnits: true, defaultMonthlyCharge: true, createdAt: true
      }
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

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: LATE FEE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/estates/:id/late-fee-config
// Returns the late fee configuration for an estate
const getLateFeeConfig = async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estate = await prisma.estate.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        lateFeeEnabled: true,
        lateFeeType: true,
        lateFeeValue: true,
        lateFeeKickInAfterDays: true,
        lateFeeCompounding: true,
        lateFeeMaxCap: true
      }
    });

    if (!estate) return res.status(404).json({ error: "Estate not found" });

    return res.json({
      lateFeeConfig: {
        estateId: estate.id,
        estateName: estate.name,
        enabled: estate.lateFeeEnabled,
        type: estate.lateFeeType,
        value: estate.lateFeeValue,
        kickInAfterDays: estate.lateFeeKickInAfterDays,
        compounding: estate.lateFeeCompounding,
        maxCap: estate.lateFeeMaxCap
      }
    });
  } catch (err) {
    console.error("Get late fee config error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// PUT /api/estates/:id/late-fee-config
// Updates the late fee configuration for an estate
const updateLateFeeConfig = async (req, res) => {
  const { id } = req.params;
  const {
    enabled,
    type,
    value,
    kickInAfterDays,
    compounding,
    maxCap
  } = req.body;

  if (!id) return res.status(400).json({ error: "Estate ID is required" });

  try {
    const estate = await prisma.estate.findUnique({ where: { id: parseInt(id) } });
    if (!estate) return res.status(404).json({ error: "Estate not found" });

    // Validation
    if (enabled !== undefined && typeof enabled !== 'boolean')
      return res.status(400).json({ error: "enabled must be boolean" });

    if (type && !['PERCENTAGE', 'FIXED'].includes(type))
      return res.status(400).json({ error: "type must be PERCENTAGE or FIXED" });

    if (value !== undefined) {
      if (typeof value !== 'number' || value <= 0)
        return res.status(400).json({ error: "value must be a positive number" });
    }

    if (kickInAfterDays !== undefined) {
      if (!Number.isInteger(kickInAfterDays) || kickInAfterDays < 0)
        return res.status(400).json({ error: "kickInAfterDays must be a non-negative integer" });
    }

    if (compounding && !['SIMPLE', 'COMPOUND'].includes(compounding))
      return res.status(400).json({ error: "compounding must be SIMPLE or COMPOUND" });

    if (maxCap !== undefined) {
      if (maxCap !== null && (typeof maxCap !== 'number' || maxCap <= 0))
        return res.status(400).json({ error: "maxCap must be a positive number or null" });
    }

    // Update
    const updateData = {};
    if (enabled !== undefined)       updateData.lateFeeEnabled       = enabled;
    if (type)                        updateData.lateFeeType          = type;
    if (value !== undefined)         updateData.lateFeeValue         = value;
    if (kickInAfterDays !== undefined) updateData.lateFeeKickInAfterDays = kickInAfterDays;
    if (compounding)                 updateData.lateFeeCompounding   = compounding;
    if (maxCap !== undefined)        updateData.lateFeeMaxCap        = maxCap;

    const updated = await prisma.estate.update({
      where: { id: parseInt(id) },
      data:  updateData,
      select: {
        id: true,
        name: true,
        lateFeeEnabled: true,
        lateFeeType: true,
        lateFeeValue: true,
        lateFeeKickInAfterDays: true,
        lateFeeCompounding: true,
        lateFeeMaxCap: true
      }
    });

    return res.json({
      message: "Late fee configuration updated",
      lateFeeConfig: {
        estateId: updated.id,
        estateName: updated.name,
        enabled: updated.lateFeeEnabled,
        type: updated.lateFeeType,
        value: updated.lateFeeValue,
        kickInAfterDays: updated.lateFeeKickInAfterDays,
        compounding: updated.lateFeeCompounding,
        maxCap: updated.lateFeeMaxCap
      }
    });
  } catch (err) {
    console.error("Update late fee config error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  createEstate,
  getEstates,
  getEstate,
  updateEstate,
  deleteEstate,
  getLateFeeConfig,
  updateLateFeeConfig
};