const prisma = require("../../prisma/client");

// ─── HELPERS ─────────────────────────────────────────────────

// Generate unit records "Unit 1" … "Unit N" for a given estate.
// Only creates units whose numbers don't already exist.
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
// POST /api/estates
// Auto-links the creating user to the new estate and bulk-creates
// placeholder Unit records (Unit 1 … Unit N) using defaultMonthlyCharge.
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

    // Create estate + placeholder units in one transaction
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

    // Link this user to the newly created estate
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
// Syncs Unit records to match the new numberOfUnits:
//   Increase → create new placeholder units continuing from the current max.
//   Decrease → delete highest-numbered vacant units down to the new count.
//              Blocks if there aren't enough vacant units to shed.
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

    // ── Unit sync ─────────────────────────────────────────────
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
        // ── Increase: create Unit (currentCount+1) … Unit (newCount) ──
        const chargeToUse = newCharge ?? parseFloat(estate.defaultMonthlyCharge);
        await prisma.$transaction(async (tx) => {
          await generateUnits(tx, parseInt(id), currentCount + 1, newCount, chargeToUse);
        });

      } else if (newCount < currentCount) {
        // ── Decrease: remove highest units that are vacant ────────────
        const toRemove  = currentCount - newCount;

        // Work from the end (highest unit IDs last)
        const vacantFromEnd = [...currentUnits]
          .reverse()
          .filter(u => u.residents.length === 0);

        if (vacantFromEnd.length < toRemove) {
          const occupiedBlocking = toRemove - vacantFromEnd.length;
          return res.status(409).json({
            error: `Cannot reduce to ${newCount} units — ${occupiedBlocking} of the units that would be removed still have active residents. ` +
                   `Please reassign or deactivate those residents first.`
          });
        }

        const unitIdsToDelete = vacantFromEnd.slice(0, toRemove).map(u => u.id);
        await prisma.unit.deleteMany({ where: { id: { in: unitIdsToDelete } } });
      }
    }

    // ── Save estate fields ────────────────────────────────────
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

module.exports = { createEstate, getEstates, getEstate, updateEstate, deleteEstate };