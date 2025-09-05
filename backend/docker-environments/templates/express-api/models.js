// Sample JavaScript Models for OverForge Express.js Template
// Users can replace this with their own model definitions

// Example 1: Product Model (E-commerce)
class Product {
  constructor({ name = '', price = 0, category = '', description = '', stock_quantity = 0, is_available = true }) {
    this.name = name;
    this.price = price;
    this.category = category;
    this.description = description;
    this.stock_quantity = stock_quantity;
    this.is_available = is_available;
    this.created_at = new Date().toISOString();
  }
  
  // Method to check if product is in stock
  isInStock() {
    return this.stock_quantity > 0 && this.is_available;
  }
  
  // Method to apply discount
  applyDiscount(percentage) {
    this.price = this.price * (1 - percentage / 100);
    return this.price;
  }
}

// Example 2: User Model (User Management)
class User {
  constructor({ name = '', email = '', phone = '', role = 'user', status = 'active', bio = '' }) {
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.role = role;
    this.status = status;
    this.bio = bio;
    this.created_at = new Date().toISOString();
    this.last_login = null;
    this.is_verified = false;
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
}

// Example 3: Task Model (Project Management)
class Task {
  constructor({ title = '', description = '', status = 'pending', priority = 'medium', assigned_to = '', due_date = null }) {
    this.title = title;
    this.description = description;
    this.status = status;
    this.priority = priority;
    this.assigned_to = assigned_to;
    this.due_date = due_date;
    this.created_at = new Date().toISOString();
    this.completed_at = null;
  }
  
  // Method to mark task as completed
  complete() {
    this.status = 'completed';
    this.completed_at = new Date().toISOString();
    return this.status;
  }
  
  // Method to check if task is overdue
  isOverdue() {
    if (!this.due_date) return false;
    return new Date() > new Date(this.due_date) && this.status !== 'completed';
  }
}

// Export the model you want to use
// Change this to export your custom model
module.exports = {
  Product,
  // User,
  // Task
};