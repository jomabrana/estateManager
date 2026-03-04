const prisma = require("../../prisma/client");

async function requireEstateId(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { estateId: true }
  });
  if (!user?.estateId) throw new Error("NO_ESTATE");
  return user.estateId;
}

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

// Check duplicate emails across all residents in this estate (excluding a specific residentId)
async function checkDuplicateEmails(estateId, emails, excludeResidentId = null) {
  if (!emails?.length) return null;
  const residents = await prisma.resident.findMany({
    where: {
      unit: { estateId },
      ...(excludeResidentId ? { NOT: { id: excludeResidentId } } : {})
    },
    select: { id: true, fullName: true, emails: true }
  });
  for (const email of emails) {
    const conflict = residents.find(r => r.emails.includes(email));
    if (conflict) return `Email "${email}" is already registered to ${conflict.fullName}`;
  }
  return null;
}

// ─── CREATE UNIT + RESIDENT TOGETHER ─────────────────────────
const createTenant = async (req, res) => {
  const { unitNumber, monthlyCharge, fullName, emails, phones, type, moveInDate, notes } = req.body;

  if (!unitNumber || monthlyCharge === undefined || !fullName || !type || !moveInDate)
    return res.status(400).json({ error: "unitNumber, monthlyCharge, fullName, type and moveInDate are required" });

  const emailList = Array.isArray(emails) ? emails.filter(Boolean) : [];
  const phoneList = Array.isArray(phones) ? phones.filter(Boolean) : [];

  try {
    const estateId = await requireEstateId(req.user.userId);

    // Dedup: block duplicate unit number
    const existingUnit = await prisma.unit.findFirst({ where: { estateId, unitNumber } });
    if (existingUnit)
      return res.status(409).json({ error: `Unit "${unitNumber}" already exists in this estate` });

    // Dedup: block duplicate emails across estate
    const emailConflict = await checkDuplicateEmails(estateId, emailList);
    if (emailConflict)
      return res.status(409).json({ error: emailConflict });

    const result = await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: { estateId, unitNumber, monthlyCharge: parseFloat(monthlyCharge) }
      });
      const resident = await tx.resident.create({
        data: {
          unitId: unit.id, fullName, emails: emailList, phones: phoneList,
          type, moveInDate: new Date(moveInDate), notes: notes || null, isActive: true
        }
      });
      return { unit, resident };
    });

    await syncEstateUnitCount(estateId);

    return res.status(201).json({ message: "Unit and resident created", unit: result.unit, resident: result.resident });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Create tenant error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET ALL RESIDENTS (flat, scoped to estate) ───────────────
// GET /api/tenants
const getTenants = async (req, res) => {
  try {
    const estateId = await requireEstateId(req.user.userId);

    const residents = await prisma.resident.findMany({
      where: { unit: { estateId } },
      include: {
        unit: { select: { id: true, unitNumber: true, monthlyCharge: true } }
      },
      orderBy: [{ unit: { unitNumber: "asc" } }, { fullName: "asc" }]
    });

    return res.json({ tenants: residents });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get tenants error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET SINGLE RESIDENT ─────────────────────────────────────
// GET /api/tenants/:id
const getTenant = async (req, res) => {
  try {
    const estateId = await requireEstateId(req.user.userId);

    const resident = await prisma.resident.findFirst({
      where: { id: parseInt(req.params.id), unit: { estateId } },
      include: {
        unit: { select: { id: true, unitNumber: true, monthlyCharge: true } }
      }
    });

    if (!resident) return res.status(404).json({ error: "Resident not found" });
    return res.json({ tenant: resident });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Get tenant error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── UPDATE RESIDENT ─────────────────────────────────────────
const updateTenant = async (req, res) => {
  const { fullName, emails, phones, type, moveInDate, notes, isActive, unitNumber, monthlyCharge } = req.body;

  try {
    const estateId = await requireEstateId(req.user.userId);
    const resident = await prisma.resident.findFirst({
      where: { id: parseInt(req.params.id), unit: { estateId } },
      include: { unit: true }
    });
    if (!resident) return res.status(404).json({ error: "Resident not found" });

    const emailList = Array.isArray(emails) ? emails.filter(Boolean) : undefined;

    // Dedup: block unit number conflict on edit (excluding current unit)
    if (unitNumber && unitNumber !== resident.unit.unitNumber) {
      const conflict = await prisma.unit.findFirst({
        where: { estateId, unitNumber, NOT: { id: resident.unitId } }
      });
      if (conflict)
        return res.status(409).json({ error: `Unit "${unitNumber}" already exists in this estate` });
    }

    // Dedup: block email conflict on edit (excluding this resident)
    if (emailList?.length) {
      const emailConflict = await checkDuplicateEmails(estateId, emailList, resident.id);
      if (emailConflict)
        return res.status(409).json({ error: emailConflict });
    }

    const result = await prisma.$transaction(async (tx) => {
      const unitData = {};
      if (unitNumber !== undefined) unitData.unitNumber = unitNumber;
      if (monthlyCharge !== undefined) unitData.monthlyCharge = parseFloat(monthlyCharge);
      if (Object.keys(unitData).length) {
        await tx.unit.update({ where: { id: resident.unitId }, data: unitData });
      }

      const residentData = {};
      if (fullName !== undefined)   residentData.fullName   = fullName;
      if (emailList !== undefined)  residentData.emails     = emailList;
      if (phones !== undefined)     residentData.phones     = Array.isArray(phones) ? phones.filter(Boolean) : [];
      if (type !== undefined)       residentData.type       = type;
      if (moveInDate !== undefined) residentData.moveInDate = new Date(moveInDate);
      if (notes !== undefined)      residentData.notes      = notes;
      if (isActive !== undefined)   residentData.isActive   = isActive;

      return tx.resident.update({
        where: { id: resident.id },
        data: residentData,
        include: { unit: { select: { id: true, unitNumber: true, monthlyCharge: true } } }
      });
    });

    return res.json({ message: "Resident updated", tenant: result });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Update tenant error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── DELETE RESIDENT ─────────────────────────────────────────
// DELETE /api/tenants/:id?deleteUnit=true
// deleteUnit=true also removes the unit if it has no other residents
const deleteTenant = async (req, res) => {
  const deleteUnit = req.query.deleteUnit === "true";

  try {
    const estateId = await requireEstateId(req.user.userId);

    const resident = await prisma.resident.findFirst({
      where: { id: parseInt(req.params.id), unit: { estateId } },
      include: { unit: { include: { residents: true } } }
    });
    if (!resident) return res.status(404).json({ error: "Resident not found" });

    await prisma.$transaction(async (tx) => {
      await tx.resident.delete({ where: { id: resident.id } });

      // If deleteUnit flag set and no other residents remain, delete unit too
      if (deleteUnit && resident.unit.residents.length === 1) {
        await tx.unit.delete({ where: { id: resident.unitId } });
      }
    });

    return res.json({ message: "Resident deleted" });
  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Delete tenant error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { createTenant, getTenants, getTenant, updateTenant, deleteTenant };