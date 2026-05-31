const prisma = require("../../prisma/client");
const { sendCommunication } = require("../services/communicationSender");

// ═══════════════════════════════════════════════════════════════════════════════
// COMMUNICATION LOG CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════

// GET: List all communications
const getCommunications = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId) {
      return res.status(400).json({ error: "No estate linked" });
    }

    const communications = await prisma.communicationLog.findMany({
      where: { estateId: user.estateId },
      include: {
        resident: { select: { id: true, fullName: true } },
        invoice: { select: { id: true, referenceNo: true } }
      },
      orderBy: { sentAt: 'desc' }
    });

    return res.json({ communications });
  } catch (err) {
    console.error('Get communications error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// GET: Get communication history for a specific invoice
const getCommunicationHistory = async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.invoiceId);
    
    const communications = await prisma.communicationLog.findMany({
      where: { invoiceId },
      include: {
        resident: { select: { id: true, fullName: true } }
      },
      orderBy: { sentAt: 'desc' }
    });

    return res.json({ communications });
  } catch (err) {
    console.error('Get communication history error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// POST: Send manual communication (admin)
const sendManualCommunication = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { estateId: true, role: true }
    });
    if (user.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { invoiceId, residentId, type, subject, content, recipient } = req.body;

    if (!residentId || !type || !content || !recipient) {
      return res.status(400).json({ error: "Missing required fields: residentId, type, content, recipient" });
    }

    const comm = await prisma.communicationLog.create({
      data: {
        invoiceId: invoiceId ? parseInt(invoiceId) : null,
        residentId: parseInt(residentId),
        estateId: user.estateId,
        type,
        subject: subject || null,
        content,
        recipient,
        channel: type,
        sentBy: `ADMIN_${user.id}`,
        status: 'QUEUED'
      }
    });

    try {
      await sendCommunication(comm);
      const updated = await prisma.communicationLog.update({
        where: { id: comm.id },
        data: { status: "SENT", failureReason: null, sentAt: new Date() }
      });
      return res.status(201).json({ message: "Communication sent", communication: updated });
    } catch (sendErr) {
      const updated = await prisma.communicationLog.update({
        where: { id: comm.id },
        data: { status: "FAILED", failureReason: String(sendErr.message || sendErr) }
      });
      return res.status(201).json({
        message: "Communication queued but failed to send",
        communication: updated
      });
    }
  } catch (err) {
    console.error('Send communication error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// GET: Get pending/failed communications (queue)
const getCommunicationQueue = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId) {
      return res.status(400).json({ error: "No estate linked" });
    }

    const communications = await prisma.communicationLog.findMany({
      where: {
        estateId: user.estateId,
        status: { in: ['QUEUED', 'FAILED'] }
      },
      orderBy: { createdAt: 'asc' }
    });

    return res.json({ communications });
  } catch (err) {
    console.error('Get queue error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// POST: Retry failed communication
const retryCommunication = async (req, res) => {
  try {
    const commId = req.params.id;
    
    const comm = await prisma.communicationLog.update({
      where: { id: commId },
      data: {
        status: 'QUEUED',
        updatedAt: new Date()
      }
    });

    try {
      await sendCommunication(comm);
      const updated = await prisma.communicationLog.update({
        where: { id: comm.id },
        data: { status: "SENT", failureReason: null, sentAt: new Date() }
      });
      return res.json({ message: "Communication sent", communication: updated });
    } catch (sendErr) {
      const updated = await prisma.communicationLog.update({
        where: { id: comm.id },
        data: { status: "FAILED", failureReason: String(sendErr.message || sendErr) }
      });
      return res.json({ message: "Retry failed", communication: updated });
    }
  } catch (err) {
    console.error('Retry communication error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// GET: Residents with invoice status + total owing (for communications targeting)
// GET /api/communications/residents-summary
const getResidentsSummary = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { estateId: true }
    });
    if (!user?.estateId) return res.status(400).json({ error: "No estate linked" });

    const residents = await prisma.resident.findMany({
      where: { unit: { estateId: user.estateId }, isActive: true },
      select: {
        id: true,
        fullName: true,
        emails: true,
        phones: true,
        unit: { select: { unitNumber: true } },
        invoices: {
          select: { status: true, totalOutstanding: true, daysOverdue: true },
          where: { estateId: user.estateId }
        }
      },
      orderBy: [{ unit: { unitNumber: "asc" } }, { fullName: "asc" }]
    });

    const summary = residents.map(r => {
      const invoices = r.invoices || [];
      const totalOwing = invoices.reduce((sum, inv) => sum + parseFloat(inv.totalOutstanding || 0), 0);

      let invoiceStatus = "PAID";
      if (totalOwing > 0) {
        const anyOverdue = invoices.some(inv => inv.status === "OVERDUE" || (inv.daysOverdue || 0) > 0);
        const anyPartial = invoices.some(inv => inv.status === "PARTIAL");
        invoiceStatus = anyOverdue ? "OVERDUE" : anyPartial ? "PARTIAL" : "PENDING";
      }

      return {
        id: r.id,
        fullName: r.fullName,
        unitNumber: r.unit?.unitNumber || null,
        emails: r.emails || [],
        phones: r.phones || [],
        totalOwing,
        invoiceStatus
      };
    });

    return res.json({ residents: summary });
  } catch (err) {
    console.error("Get residents summary error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getCommunications,
  getCommunicationHistory,
  sendManualCommunication,
  getCommunicationQueue,
  retryCommunication,
  getResidentsSummary
};
