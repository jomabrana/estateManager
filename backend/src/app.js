require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('../prisma/client');
const authRoutes = require('./routes/authRoutes');
const resourceRoutes = require('./routes/router');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', resourceRoutes);             

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Health checks
app.get('/health', (req, res) => {
  res.json({ status: 'active', message: 'Service Charge API is healthy and running' });
});

app.get('/dbstatus', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ✅ SPA FALLBACK - Use middleware, NOT app.get('*')
app.use((req, res) => {
  if (!req.url.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 5000;

prisma.$connect()
  .then(() => console.log('✅ Database connected successfully'))
  .catch((e) => console.error('❌ Database connection failed:', e));

app.listen(PORT, () => {
  console.log(`Serving backend on http://localhost:${PORT}`);
});