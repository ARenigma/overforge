'use strict';

module.exports = (sequelize, DataTypes) => {
  const InterviewSession = sequelize.define('InterviewSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    sessionCode: {
      type: DataTypes.STRING(8),
      allowNull: false,
      unique: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    jobDescription: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    language: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'javascript'
    },
    experienceLevel: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
      allowNull: false,
      defaultValue: 'intermediate'
    },
    status: {
      type: DataTypes.ENUM('created', 'active', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'created'
    },
    interviewerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    candidateId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    },
    // Assessment configuration
    maxDuration: {
      type: DataTypes.INTEGER,
      defaultValue: 60
    },
    // Session timing
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Assessment results
    extractedParameters: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    mainProblem: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    finalScore: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    maxScore: {
      type: DataTypes.INTEGER,
      defaultValue: 9
    },
    assessmentData: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    // Access control
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    allowedCandidateEmails: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    // Metadata
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    tableName: 'interview_sessions',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['sessionCode']
      },
      {
        fields: ['interviewerId']
      },
      {
        fields: ['candidateId']
      },
      {
        fields: ['status']
      }
    ]
  });

  // Instance methods
  InterviewSession.prototype.generateSessionCode = function() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  InterviewSession.prototype.getInterviewerUrl = function() {
    return `/room/${this.sessionCode}?role=interviewer&jobDescription=${encodeURIComponent(this.jobDescription)}`;
  };

  InterviewSession.prototype.getCandidateUrl = function() {
    return `/room/${this.sessionCode}?role=candidate`;
  };

  InterviewSession.prototype.canCandidateJoin = function(candidateEmail) {
    if (this.isPublic) return true;
    if (!this.allowedCandidateEmails) return false;
    return this.allowedCandidateEmails.includes(candidateEmail);
  };

  InterviewSession.prototype.isActive = function() {
    return this.status === 'active';
  };

  InterviewSession.prototype.isCompleted = function() {
    return this.status === 'completed';
  };

  // Associations
  InterviewSession.associate = function(models) {
    InterviewSession.belongsTo(models.User, {
      foreignKey: 'interviewerId',
      as: 'interviewer'
    });
    
    InterviewSession.belongsTo(models.User, {
      foreignKey: 'candidateId',
      as: 'candidate'
    });
  };

  return InterviewSession;
}; 