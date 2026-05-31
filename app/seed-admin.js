// backend/seed-admin.js
// Purpose: Seed ONLY admin user (for testing estate creation)
// Usage: cd backend && node seed-admin.js

require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('./prisma/client');

async function seed() {
  try {
    console.log('🌱 Starting admin seed process...\n');

    // ── ADMIN USER ──────────────────────────────────────────────
    let user = await prisma.user.findUnique({ where: { email: 'admin1@test.com' } });

    if (user) {
      console.log('ℹ️  User admin1@test.com already exists');
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

    // ── SUMMARY ─────────────────────────────────────────────────
    console.log('\n─────────────────────────────────────────');
    console.log('🔑 Login Credentials:');
    console.log('   Email:    admin1@test.com');
    console.log('   Password: ordwasp0.1');
    console.log('\n📍 Ready to test:');
    console.log('   ✓ Estate creation');
    console.log('   ✓ Unit creation');
    console.log('   ✓ Resident creation');
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