const { Room, User } = require('../../models');

// Create a new room
exports.createRoom = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Room name is required.' });
    }
    // Validate room name
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(name)) {
      return res.status(400).json({ message: 'Room name must be 3-32 chars, alphanumeric, dashes/underscores only.' });
    }
    // Check if room name exists
    const existingRoom = await Room.findOne({ where: { name } });
    if (existingRoom) {
      return res.status(409).json({ message: 'Room name already exists.' });
    }
    const room = await Room.create({
      name,
      createdBy: req.user.id,
      isActive: true
    });
    res.status(201).json({ room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Join a room by name
exports.joinRoom = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Room name is required.' });
    }
    // Validate room name
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(name)) {
      return res.status(400).json({ message: 'Room name must be 3-32 chars, alphanumeric, dashes/underscores only.' });
    }
    const room = await Room.findOne({ where: { name, isActive: true } });
    if (!room) {
      return res.status(404).json({ message: 'Room not found or inactive.' });
    }
    // Optionally: Add user to participants (future many-to-many)
    res.json({ room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// List all active rooms
exports.listRooms = async (req, res) => {
  try {
    const rooms = await Room.findAll({ where: { isActive: true }, order: [['createdAt', 'DESC']] });
    res.json({ rooms });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}; 