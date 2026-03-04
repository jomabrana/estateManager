// backend/seeder.js
// Purpose: Seed admin user, estate, units and residents
// Usage: cd backend && node seeder.js

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
    notes: null,
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
    notes: null,
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
    notes: null,
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
    notes: null,
  },
];

async function seed() {
  try {
    console.log('🌱 Starting seed process...\n');

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

    // ── ESTATE ──────────────────────────────────────────────────
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
        },
      });
      console.log(`\n✅ Estate created — ID: ${estate.id} | ${estate.name}`);
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

    for (const r of RESIDENTS) {
      // Check if unit already exists
      const existingUnit = await prisma.unit.findFirst({
        where: { estateId: estate.id, unitNumber: r.unitNumber },
        include: { residents: true },
      });

      if (existingUnit) {
        console.log(`   ℹ️  Unit ${r.unitNumber} already exists — skipping`);
        continue;
      }

      // Create unit then resident in a transaction
      await prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: {
            estateId: estate.id,
            unitNumber: r.unitNumber,
            monthlyCharge: r.monthlyCharge,
          },
        });

        await tx.resident.create({
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
      });

      console.log(`   ✅ Unit ${r.unitNumber} — ${r.fullName} (${r.type})`);
    }

    // ── SUMMARY ─────────────────────────────────────────────────
    console.log('\n─────────────────────────────────────────');
    console.log('🔑 Login Credentials:');
    console.log('   Email:    admin1@test.com');
    console.log('   Password: ordwasp0.1');
    console.log('\n📍 Test URL: http://localhost:5000/login.html');
    console.log('─────────────────────────────────────────');

  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n✨ Done!\n');
  }
}

seed();