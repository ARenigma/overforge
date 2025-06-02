const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const auth = require('../middleware/auth');

// Create a new room (protected)
router.post('/', auth, roomController.createRoom);
// Join a room (protected)
router.post('/join', auth, roomController.joinRoom);
// List all active rooms (public)
router.get('/', roomController.listRooms);

module.exports = router; 