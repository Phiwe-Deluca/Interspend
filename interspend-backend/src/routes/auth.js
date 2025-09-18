const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || 'secret';
const accessTtl = process.env.ACCESS_TTL || '1h';

router.post('/register', async (req, res) => {
  try {
    const { email, password, phone, country } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const biometricToken = uuidv4();

    const user = await prisma.user.create({
      data: { email, passwordHash, phone, country, biometricToken }
    });

    await prisma.wallet.create({
      data: {
        userId: user.id,
        currency: 'ZAR',
        availableBalance: 0,
        reservedBalance: 0,
        tierStatus: 'PARTIAL'
      }
    });

    const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: accessTtl });
    res.status(201).json({ accessToken: token, biometricToken: user.biometricToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: accessTtl });
    res.json({ accessToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
