// backend/seed-user.js
// Purpose: Create initial test admin user in database
// Usage: cd backend && node seed-user.js

require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('./prisma/client');

async function seedUser() {
  try {
    console.log('🌱 Starting seed process...');

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: 'admin1@test.com' }
    });

    if (existing) {
      console.log('ℹ️  User admin1@test.com already exists. Skipping...');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Full Name: ${existing.fullName}`);
      console.log(`   Role: ${existing.role}`);
      await prisma.$disconnect();
      return;
    }

    // Hash password with bcrypt (10 salt rounds)
    console.log('🔐 Hashing password...');
    const plainPassword = 'ordwasp0.1';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log(`   Hash: ${hashedPassword.substring(0, 20)}... (truncated)`);

    // Create user in database
    console.log('💾 Creating user in database...');
    const user = await prisma.user.create({
      data: {
        fullName: 'Admin One',
        email: 'admin1@test.com',
        password: hashedPassword,
        role: 'admin'
      }
    });

    console.log('\n✅ Seed user created successfully!\n');
    console.log('📋 User Details:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Full Name: ${user.fullName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Created At: ${user.createdAt}`);

    console.log('\n🔑 Login Credentials:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${plainPassword}`);

    console.log('\n📍 Test URL:');
    console.log('   http://localhost:5000/login.html');

  } catch (err) {
    console.error('❌ Error during seed:', err.message);
    if (err.code === 'P2002') {
      console.error('\n   Cause: Email already exists in database');
      console.error('   Try: node seed-user.js (will skip if exists)');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n✨ Done!\n');
  }
}

seedUser();
