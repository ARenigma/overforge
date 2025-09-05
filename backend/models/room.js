'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Room extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Room.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [3, 32] // Example validation
      }
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users', // Assumes your User model is named 'Users'
        key: 'id'
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    language: {
      type: DataTypes.STRING,
      allowNull: true // Or false if it's mandatory at room creation
    },
    experienceLevel: {
      type: DataTypes.STRING, // e.g., "0-2", "2-5", "5+"
      allowNull: true // Or false
    }
  }, {
    sequelize,
    modelName: 'Room',
  });
  return Room;
};