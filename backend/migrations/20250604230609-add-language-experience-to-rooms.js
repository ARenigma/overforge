'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Rooms', 'language', {
      type: Sequelize.STRING,
      allowNull: true, // Set to false if every room MUST have a language
    });
    await queryInterface.addColumn('Rooms', 'experienceLevel', {
      type: Sequelize.STRING,
      allowNull: true, // Set to false if every room MUST have an experience level
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Rooms', 'language');
    await queryInterface.removeColumn('Rooms', 'experienceLevel');
  }
};