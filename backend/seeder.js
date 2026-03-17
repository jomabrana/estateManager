// backend/seeder.js (ENHANCED)
// Purpose: Seed admin user, estate, units, residents, AND invoices with monthly breakdown
// Usage: cd backend && node seeder.js
// This includes Phase 1 & 2 data so you can test Phase 3 (Late Fees) immediately

require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('./prisma/client');

const RESIDENTS = [
  {
    unitNumber: '1',
    monthlyCharge: 15000,
    fullName: 'John Kiriamiti',
    type: 'DIRECT_TENANT',
    emails: ['johnkiriamiti@gmail.com'],
    phones: ['2547921342321'],
    moveInDate: new Date('2025-01-01'),
    isActive: true,
    notes: 'Regular tenant',
  },
  {
    unitNumber: '2',
    monthlyCharge: 15000,
    fullName: 'Jane Onsongo',
    type: 'OWNER_OCCUPIER',
    emails: ['janeonsongo@gmail.com'],
    phones: ['254733215907'],
    moveInDate: new Date('2015-02-01'),
    isActive: true,
    notes: 'Long-time occupier',
  },
  {
    unitNumber: '3',
    monthlyCharge: 15000,
    fullName: 'Kelly Masombo',
    type: 'MANAGED_TENANT',
    emails: ['kellymasombo@gmail.com'],
    phones: ['254712572312'],
    moveInDate: new Date('2025-07-01'),
    isActive: true,
    notes: 'Managed tenant',
  },
  {
    unitNumber: '4',
    monthlyCharge: 15000,
    fullName: 'Brian Marunga',
    type: 'ABSENTEE_OWNER',
    emails: ['brianmarunga@gmail.com'],
    phones: ['254721354912'],
    moveInDate: new Date('2026-01-01'),
    isActive: true,
    notes: 'Absentee owner',
  },
];

async function seed() {
  try {
    console.log('🌱 Starting comprehensive seed process...\n');

    // ── ADMIN USER ──────────────────────────────────────────────
    let user = await prisma.user.findUnique({ where: { email: 'admin1@test.com' } });

    if (user) {
      console.log('ℹ️  User admin1@test.com already exists — skipping user creation');
      console.log(`   ID: ${user.id} | Name: ${user.fullName}`);
    } else {
      console.log('🔐 Hashing password...');
      const hashed = await bcrypt.hash('ordwasp0.1', 10);

      user = await prisma.user.create({
        data: {
          fullName: 'Admin One',
          email: 'admin1@test.com',
          password: hashed,
          role: 'admin',
        },
      });
      console.log(`✅ User created — ID: ${user.id} | ${user.email}`);
    }

    // ── ESTATE with Late Fee Config ──────────────────────────────
    let estate = await prisma.estate.findFirst({ where: { name: 'Akiba' } });

    if (estate) {
      console.log('\nℹ️  Estate "Akiba" already exists — skipping estate creation');
      console.log(`   ID: ${estate.id}`);
    } else {
      estate = await prisma.estate.create({
        data: {
          name: 'Akiba',
          location: 'South B, Nairobi',
          description: 'Akiba residential estate, just off likoni road',
          numberOfUnits: RESIDENTS.length,
          // Late fee config: 10% SIMPLE, kicks in after 7 days
          lateFeeEnabled: true,
          lateFeeType: 'PERCENTAGE',
          lateFeeValue: 10,
          lateFeeKickInAfterDays: 7,
          lateFeeCompounding: 'SIMPLE',
          lateFeeMaxCap: 5000,
        },
      });
      console.log(`\n✅ Estate created — ID: ${estate.id} | ${estate.name}`);
      console.log(`   Late fee config: 10% SIMPLE (after 7 days, max 5000 KES)`);
    }

    // ── LINK USER TO ESTATE ─────────────────────────────────────
    if (user.estateId !== estate.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { estateId: estate.id },
      });
      console.log(`✅ User linked to estate "${estate.name}"`);
    }

    // ── UNITS + RESIDENTS ───────────────────────────────────────
    console.log('\n🏘️  Seeding units and residents...');

    const residentMap = new Map(); // Store resident IDs for invoice creation

    for (const r of RESIDENTS) {
      // Check if unit already exists
      const existingUnit = await prisma.unit.findFirst({
        where: { estateId: estate.id, unitNumber: r.unitNumber },
        include: { residents: true },
      });

      if (existingUnit) {
        console.log(`   ℹ️  Unit ${r.unitNumber} already exists`);
        // Store resident for invoice creation
        if (existingUnit.residents.length > 0) {
          residentMap.set(r.fullName, {
            unitId: existingUnit.id,
            residentId: existingUnit.residents[0].id,
            monthlyCharge: existingUnit.monthlyCharge,
          });
        }
        continue;
      }

      // Create unit then resident in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: {
            estateId: estate.id,
            unitNumber: r.unitNumber,
            monthlyCharge: r.monthlyCharge,
          },
        });

        const resident = await tx.resident.create({
          data: {
            unitId: unit.id,
            fullName: r.fullName,
            type: r.type,
            emails: r.emails,
            phones: r.phones,
            moveInDate: r.moveInDate,
            isActive: r.isActive,
            notes: r.notes,
          },
        });

        return { unit, resident };
      });

      console.log(`   ✅ Unit ${r.unitNumber} — ${r.fullName} (${r.type})`);
      residentMap.set(r.fullName, {
        unitId: result.unit.id,
        residentId: result.resident.id,
        monthlyCharge: result.unit.monthlyCharge,
      });
    }

    // ── INVOICES WITH MONTHLY BREAKDOWN (Phase 2) ───────────────
    console.log('\n📋 Seeding invoices with monthly breakdown...');

    // Create invoices for Jan, Feb, Mar 2025
    const months = [
      { month: '2025-01', label: 'January' },
      { month: '2025-02', label: 'February' },
      { month: '2025-03', label: 'March' },
    ];

    for (const [residentName, residentData] of residentMap) {
      for (const monthData of months) {
        // Check if invoice already exists for this month
        const [year, monthNum] = monthData.month.split('-').map(Number);

        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            residentId: residentData.residentId,
            billingMonth: monthNum,
            billingYear: year,
          },
        });

        if (existingInvoice) {
          continue;
        }

        // Create due date (end of month)
        const dueDate = new Date(year, monthNum, 0); // Last day of month

        // Generate reference number
        const referenceNo = `INV-${residentData.residentId}-${monthData.month}`;

        // Create invoice
        const invoice = await prisma.invoice.create({
          data: {
            residentId: residentData.residentId,
            unitId: residentData.unitId,
            estateId: estate.id,
            amount: residentData.monthlyCharge,
            amountPaid: 0,
            status: 'PENDING',
            billingMonth: monthNum,
            billingYear: year,
            dueDate,
            referenceNo,
          },
        });

        // Create InvoiceMonth record (Phase 2)
        await prisma.invoiceMonth.create({
          data: {
            invoiceId: invoice.id,
            month: monthData.month,
            dueDate,
            baseAmount: residentData.monthlyCharge,
            amountRemaining: residentData.monthlyCharge,
            status: 'UNPAID',
          },
        });
      }

      console.log(
        `   ✅ Created invoices (Jan, Feb, Mar) for ${residentName}`
      );
    }

    // ── MARK JANUARY AS OVERDUE (for late fee testing) ───────────
    console.log('\n⏰ Marking January 2025 invoices as overdue (for Phase 3 testing)...');

    const januaryInvoices = await prisma.invoice.findMany({
      where: {
        estateId: estate.id,
        billingMonth: 1,
        billingYear: 2025,
      },
    });

    for (const invoice of januaryInvoices) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE', daysOverdue: 45 }, // 45 days overdue
      });
    }

    console.log(`   ✅ Marked ${januaryInvoices.length} January invoices as overdue`);

    // ── SUMMARY ─────────────────────────────────────────────────
    console.log('\n─────────────────────────────────────────');
    console.log('✅ SEED COMPLETE');
    console.log('─────────────────────────────────────────');
    console.log(`Admin: admin1@test.com / ordwasp0.1`);
    console.log(`Estate: Akiba (Late fee: 10% SIMPLE)`);
    console.log(`Units: 4 with residents`);
    console.log(`Invoices: 12 total (3 months × 4 residents)`);
    console.log(`Overdue: 4 (January 2025 invoices)`);
    console.log('─────────────────────────────────────────');
    console.log('\n🎯 Ready for Phase 3 (Late Fees Testing)!');
    console.log('   - Login with: admin1@test.com / ordwasp0.1');
    console.log('   - Test late fee application on January invoices');
    console.log('   - Test late fee configuration in estate settings\n');

  } catch (err) {
    console.error('❌ Seed error:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('✨ Done!\n');
  }
}

seed();