'use strict';

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('interviewer', 'candidate', 'admin'),
      allowNull: false,
      defaultValue: 'candidate'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    lastLogin: {
      type: DataTypes.DATE
    },
    // Interviewer-specific fields
    organization: {
      type: DataTypes.STRING,
      allowNull: true
    },
    department: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Candidate-specific fields
    experience: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
      allowNull: true
    },
    preferredLanguage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Profile fields
    profilePicture: {
      type: DataTypes.STRING,
      allowNull: true
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'Users',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['email']
      },
      {
        unique: true,
        fields: ['username']
      },
      {
        fields: ['role']
      }
    ]
  });

  // Instance methods
  User.prototype.getFullName = function() {
    return `${this.firstName} ${this.lastName}`;
  };

  User.prototype.isInterviewer = function() {
    return this.role === 'interviewer';
  };

  User.prototype.isCandidate = function() {
    return this.role === 'candidate';
  };

  User.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    delete values.password; // Never expose password
    return values;
  };

  // Associations
  User.associate = function(models) {
    User.hasMany(models.InterviewSession, {
      foreignKey: 'interviewerId',
      as: 'interviewerSessions'
    });
    
    User.hasMany(models.InterviewSession, {
      foreignKey: 'candidateId',
      as: 'candidateSessions'
    });
  };

  return User;
};