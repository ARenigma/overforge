const { supabase } = require('../config/supabase');
const bcrypt = require('bcryptjs');

/**
 * Supabase User Service
 * Replaces Sequelize User model operations
 */
class SupabaseUserService {
  
  /**
   * Find user by email
   */
  static async findByEmail(email) {
    const { data, error } = await supabase
      .from('Users_new')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Find user by username or email
   */
  static async findByUsernameOrEmail(usernameOrEmail) {
    const { data, error } = await supabase
      .from('Users_new')
      .select('*')
      .or(`username.eq.${usernameOrEmail},email.eq.${usernameOrEmail}`)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    const { data, error } = await supabase
      .from('Users_new')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Create new user
   */
  static async create(userData) {
    // Generate username if not provided
    if (!userData.username) {
      userData.username = userData.email.split('@')[0] + '_' + Date.now();
    }

    const { data, error } = await supabase
      .from('Users_new')
      .insert([{
        ...userData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('User with this email or username already exists');
      }
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Update user
   */
  static async update(id, updateData) {
    const { data, error } = await supabase
      .from('Users_new')
      .update({
        ...updateData,
        updatedAt: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Update last login
   */
  static async updateLastLogin(id) {
    return this.update(id, { lastLogin: new Date().toISOString() });
  }

  /**
   * Hash password
   */
  static async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  /**
   * Compare password
   */
  static async comparePassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * Get user's full name
   */
  static getFullName(user) {
    return `${user.firstName} ${user.lastName}`;
  }

  /**
   * Check if user is interviewer
   */
  static isInterviewer(user) {
    return user.role === 'interviewer';
  }

  /**
   * Check if user is candidate
   */
  static isCandidate(user) {
    return user.role === 'candidate';
  }

  /**
   * Convert user to safe JSON (remove password)
   */
  static toSafeJSON(user) {
    if (!user) return null;
    const { password, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get all users (admin function)
   */
  static async findAll(filters = {}) {
    let query = supabase.from('Users_new').select('*');

    // Apply filters
    if (filters.role) {
      query = query.eq('role', filters.role);
    }
    if (filters.isActive !== undefined) {
      query = query.eq('isActive', filters.isActive);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  }

  /**
   * Count users
   */
  static async count(filters = {}) {
    let query = supabase.from('Users_new').select('id', { count: 'exact' });

    // Apply filters
    if (filters.role) {
      query = query.eq('role', filters.role);
    }
    if (filters.isActive !== undefined) {
      query = query.eq('isActive', filters.isActive);
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return count;
  }

  /**
   * Soft delete user (set isActive to false)
   */
  static async softDelete(id) {
    return this.update(id, { isActive: false });
  }

  /**
   * Hard delete user
   */
  static async delete(id) {
    const { error } = await supabase
      .from('Users_new')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return true;
  }
}

module.exports = SupabaseUserService; 