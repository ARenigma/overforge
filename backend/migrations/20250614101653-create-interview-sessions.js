'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('interview_sessions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      sessionCode: {
        type: Sequelize.STRING(8),
        allowNull: false,
        unique: true
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      jobDescription: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      language: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'javascript'
      },
      experienceLevel: {
        type: Sequelize.ENUM('beginner', 'intermediate', 'advanced'),
        allowNull: false,
        defaultValue: 'intermediate'
      },
      status: {
        type: Sequelize.ENUM('created', 'active', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'created'
      },
      interviewerId: {
        type: Sequelize.INTEGER, // INTEGER to match Users table
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      candidateId: {
        type: Sequelize.INTEGER, // INTEGER to match Users table
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
        type: Sequelize.INTEGER,
        defaultValue: 60
      },
      // Session timing
      startedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Assessment results
      extractedParameters: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      mainProblem: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      finalScore: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      maxScore: {
        type: Sequelize.INTEGER,
        defaultValue: 9
      },
      assessmentData: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      // Access control
      isPublic: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      allowedCandidateEmails: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      // Metadata
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tags: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add indexes
    await queryInterface.addIndex('interview_sessions', ['sessionCode'], {
      unique: true,
      name: 'interview_sessions_session_code_unique'
    });

    await queryInterface.addIndex('interview_sessions', ['interviewerId'], {
      name: 'interview_sessions_interviewer_id_index'
    });

    await queryInterface.addIndex('interview_sessions', ['candidateId'], {
      name: 'interview_sessions_candidate_id_index'
    });

    await queryInterface.addIndex('interview_sessions', ['status'], {
      name: 'interview_sessions_status_index'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('interview_sessions');
  }
};
