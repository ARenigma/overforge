// Test User Model for OverForge Express.js Template
// User Management System

class User {
  constructor({ 
    name = '', 
    email = '', 
    phone = '', 
    role = 'user', 
    status = 'active', 
    bio = '',
    department = '',
    join_date = null,
    salary = 0,
    is_verified = false
  }) {
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.role = role;
    this.status = status;
    this.bio = bio;
    this.department = department;
    this.join_date = join_date || new Date().toISOString();
    this.salary = salary;
    this.is_verified = is_verified;
    this.created_at = new Date().toISOString();
    this.last_login = null;
    this.profile_completion = 0;
  }
  
  // Method to verify user
  verify() {
    this.is_verified = true;
    return this.is_verified;
  }
  
  // Method to update last login
  updateLastLogin() {
    this.last_login = new Date().toISOString();
  }
  
  // Method to calculate profile completion
  calculateProfileCompletion() {
    const fields = ['name', 'email', 'phone', 'bio', 'department'];
    const completed = fields.filter(field => this[field] && this[field].trim() !== '').length;
    this.profile_completion = Math.round((completed / fields.length) * 100);
    return this.profile_completion;
  }
  
  // Method to get user display name
  getDisplayName() {
    return `${this.name} (${this.role})`;
  }
  
  // Method to check if user is active
  isActive() {
    return this.status === 'active' && this.is_verified;
  }
}

// Export the User model for testing
module.exports = {
  User
};
