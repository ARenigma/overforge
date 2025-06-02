const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');

router.post('/signup', userController.signup);
router.post('/login', userController.login);

// Example protected route
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router; 