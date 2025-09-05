const { Room, User } = require('../../models');

// Create a new room
exports.createRoom = async (req, res) => {
  try {
    const { name, language, experienceLevel } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Room name is required.' });
    }
    // Validate room name
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(name)) { // Allow dots and hyphens as they are common
      return res.status(400).json({ message: 'Room name must be 3-32 chars, alphanumeric, dots, hyphens, or underscores only.' });
    }

    // Basic validation for language and experienceLevel (can be enhanced)
    if (language && typeof language !== 'string') {
        return res.status(400).json({ message: 'Invalid language format.' });
    }
    if (experienceLevel && typeof experienceLevel !== 'string') {
        return res.status(400).json({ message: 'Invalid experience level format.' });
    }

    // Check if room name exists
    const existingRoom = await Room.findOne({ where: { name } });
    if (existingRoom) {
      return res.status(409).json({ message: 'Room name already exists.' });
    }
    const room = await Room.create({
      name,
      createdBy: req.user.id,
      isActive: true,
      language: language || null, // Store null if not provided, respecting model's allowNull: true
      experienceLevel: experienceLevel || null // Store null if not provided
    });
    res.status(201).json({ room });
  } catch (err) {
    console.error('Error creating room:', err);
    if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ message: err.errors.map(e => e.message).join(', ') });
    }
    res.status(500).json({ message: 'Server error while creating room' });
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

// Join a room by ID
exports.joinRoomById = async (req, res) => {
  try {
    const roomId = req.params.id;
    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required.' });
    }
    
    const room = await Room.findOne({ where: { id: roomId, isActive: true } });
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

// Get a room by ID
exports.getRoomById = async (req, res) => {
  try {
    const roomId = req.params.id;
    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required.' });
    }
    
    const room = await Room.findOne({ where: { id: roomId } });
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }
    
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