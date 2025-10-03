require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const convertRoutes = require('./routes/convert');
const walletRoutes = require('./routes/wallet');
const nfcRoutes = require('./routes/nfc');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api', authRoutes);
app.use('/api', convertRoutes);
app.use('/api', walletRoutes);
app.use('/api/nfc', nfcRoutes);

app.get('/', (req, res) => res.json({ status: 'InterSpend backend running' }));

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
