const express = require('express');
const userRoutes = require('./user');
const roomRoutes = require('./room');
const executeRoutes = require('./execute');
const { getLanguages } = require('../services/judge0Service');

const router = express.Router();

router.use('/users', userRoutes);
router.use('/rooms', roomRoutes);
router.use('/execute', executeRoutes);

router.get('/languages', async (req, res) => {
  try {
    const langs = await getLanguages();
    res.json({ languages: langs });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch languages' });
  }
});

module.exports = router; 