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

// ─── CREATE RESIDENT (optionally reusing an existing vacant unit) ─────────────
// POST /api/tenants
//
// Two modes:
//   A) unitId in body  → assign resident to existing unit (vacant unit flow).
//                        Skip unit creation and the duplicate-unit-number check.
//   B) no unitId       → create a brand-new unit + resident (original flow).
const createTenant = async (req, res) => {
  const {
    unitId,           // present when coming from a vacant-unit row click
    unitNumber,
    monthlyCharge,
    fullName,
    emails,
    phones,
    type,
    moveInDate,
    notes,
    isActive
  } = req.body;

  // Basic required-field check (unitNumber / monthlyCharge only needed when
  // creating a brand-new unit, i.e. when unitId is NOT supplied)
  if (!fullName || !type || !moveInDate)
    return res.status(400).json({ error: "fullName, type and moveInDate are required" });

  if (!unitId && (!unitNumber || monthlyCharge === undefined))
    return res.status(400).json({ error: "unitNumber and monthlyCharge are required when not linking to an existing unit" });

  const emailList = Array.isArray(emails) ? emails.filter(Boolean) : [];
  const phoneList = Array.isArray(phones) ? phones.filter(Boolean) : [];

  try {
    const estateId = await requireEstateId(req.user.userId);

    // ── Dedup: block duplicate emails across estate ──────────────
    const emailConflict = await checkDuplicateEmails(estateId, emailList);
    if (emailConflict)
      return res.status(409).json({ error: emailConflict });

    let result;

    if (unitId) {
      // ── MODE A: Assign to existing vacant unit ───────────────────
      const parsedUnitId = parseInt(unitId);

      // Verify the unit actually belongs to this estate
      const existingUnit = await prisma.unit.findFirst({
        where: { id: parsedUnitId, estateId }
      });
      if (!existingUnit)
        return res.status(404).json({ error: "Unit not found in this estate" });

      const resident = await prisma.resident.create({
        data: {
          unitId:    parsedUnitId,
          fullName,
          emails:    emailList,
          phones:    phoneList,
          type,
          moveInDate: new Date(moveInDate),
          notes:     notes || null,
          isActive:  isActive !== undefined ? Boolean(isActive) : true
        },
        include: {
          unit: { select: { id: true, unitNumber: true, monthlyCharge: true } }
        }
      });

      result = { unit: existingUnit, resident };

    } else {
      // ── MODE B: Create brand-new unit + resident ─────────────────
      const existingUnit = await prisma.unit.findFirst({ where: { estateId, unitNumber } });
      if (existingUnit)
        return res.status(409).json({ error: `Unit "${unitNumber}" already exists in this estate` });

      result = await prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: { estateId, unitNumber, monthlyCharge: parseFloat(monthlyCharge) }
        });
        const resident = await tx.resident.create({
          data: {
            unitId:    unit.id,
            fullName,
            emails:    emailList,
            phones:    phoneList,
            type,
            moveInDate: new Date(moveInDate),
            notes:     notes || null,
            isActive:  isActive !== undefined ? Boolean(isActive) : true
          }
        });
        return { unit, resident };
      });

      // Only sync count when a new unit was actually created
      await syncEstateUnitCount(estateId);
    }

    return res.status(201).json({
      message:  unitId ? "Resident assigned to existing unit" : "Unit and resident created",
      unit:     result.unit,
      resident: result.resident
    });

  } catch (err) {
    if (err.message === "NO_ESTATE")
      return res.status(400).json({ error: "Your account is not linked to an estate" });
    console.error("Create tenant error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ─── GET ALL RESIDENTS (flat, scoped to estate) ───────────────
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

// ─── GET SINGLE RESIDENT ──────────────────────────────────────
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

// ─── UPDATE RESIDENT ──────────────────────────────────────────
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

    if (unitNumber && unitNumber !== resident.unit.unitNumber) {
      const conflict = await prisma.unit.findFirst({
        where: { estateId, unitNumber, NOT: { id: resident.unitId } }
      });
      if (conflict)
        return res.status(409).json({ error: `Unit "${unitNumber}" already exists in this estate` });
    }

    if (emailList?.length) {
      const emailConflict = await checkDuplicateEmails(estateId, emailList, resident.id);
      if (emailConflict)
        return res.status(409).json({ error: emailConflict });
    }

    const result = await prisma.$transaction(async (tx) => {
      const unitData = {};
      if (unitNumber    !== undefined) unitData.unitNumber    = unitNumber;
      if (monthlyCharge !== undefined) unitData.monthlyCharge = parseFloat(monthlyCharge);
      if (Object.keys(unitData).length) {
        await tx.unit.update({ where: { id: resident.unitId }, data: unitData });
      }

      const residentData = {};
      if (fullName    !== undefined) residentData.fullName   = fullName;
      if (emailList   !== undefined) residentData.emails     = emailList;
      if (phones      !== undefined) residentData.phones     = Array.isArray(phones) ? phones.filter(Boolean) : [];
      if (type        !== undefined) residentData.type       = type;
      if (moveInDate  !== undefined) residentData.moveInDate = new Date(moveInDate);
      if (notes       !== undefined) residentData.notes      = notes;
      if (isActive    !== undefined) residentData.isActive   = isActive;

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

// ─── DELETE RESIDENT ──────────────────────────────────────────
// DELETE /api/tenants/:id?deleteUnit=true
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