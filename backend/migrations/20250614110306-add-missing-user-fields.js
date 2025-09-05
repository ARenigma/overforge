'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add role field with ENUM type
    await queryInterface.addColumn('Users', 'role', {
      type: Sequelize.ENUM('interviewer', 'candidate', 'admin'),
      allowNull: false,
      defaultValue: 'candidate'
    });

    // Add isActive field
    await queryInterface.addColumn('Users', 'isActive', {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    });

    // Add lastLogin field
    await queryInterface.addColumn('Users', 'lastLogin', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Add interviewer-specific fields
    await queryInterface.addColumn('Users', 'organization', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('Users', 'department', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Add candidate-specific fields
    await queryInterface.addColumn('Users', 'experience', {
      type: Sequelize.ENUM('beginner', 'intermediate', 'advanced'),
      allowNull: true
    });

    await queryInterface.addColumn('Users', 'preferredLanguage', {
      type: Sequelize.STRING,
      allowNull: true
    });

    // Add profile fields
    await queryInterface.addColumn('Users', 'profilePicture', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('Users', 'bio', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove all added columns in reverse order
    await queryInterface.removeColumn('Users', 'bio');
    await queryInterface.removeColumn('Users', 'profilePicture');
    await queryInterface.removeColumn('Users', 'preferredLanguage');
    await queryInterface.removeColumn('Users', 'experience');
    await queryInterface.removeColumn('Users', 'department');
    await queryInterface.removeColumn('Users', 'organization');
    await queryInterface.removeColumn('Users', 'lastLogin');
    await queryInterface.removeColumn('Users', 'isActive');
    await queryInterface.removeColumn('Users', 'role');
  }
};
