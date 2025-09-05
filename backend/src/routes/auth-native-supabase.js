const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase'); // This uses service role key
const { createClient } = require('@supabase/supabase-js');
const { authenticateSupabase } = require('../middleware/supabase-auth');

const router = express.Router();

// Create admin client for user management operations
const adminSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Supabase client
const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('role').isIn(['interviewer', 'candidate', 'admin']).withMessage('Invalid role')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

/**
 * Register new user with Supabase Auth
 * POST /api/auth/register
 */
router.post('/register', registerValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName, role, organization, department, experience, preferredLanguage } = req.body;

    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role: role
        }
      }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.message
      });
    }

    if (!authData.user) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create user'
      });
    }

    // Generate username from email
    const username = email.split('@')[0] + '_' + Date.now();

    // Create user profile in our Users table
    const userData = {
      id: authData.user.id, // Use Supabase Auth UUID
      email,
      username,
      firstName,
      lastName,
      role,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add role-specific fields
    if (role === 'interviewer' || role === 'admin') {
      userData.organization = organization;
      userData.department = department;
    }
    
    if (role === 'candidate' || role === 'admin') {
      userData.experience = experience;
      userData.preferredLanguage = preferredLanguage;
    }

    // Insert user data into our Users table
    const { data: userData_result, error: dbError } = await adminSupabase
      .from('Users')
      .insert([userData])
      .select()
      .single();

    if (dbError) {
      // If user creation fails, we should clean up the auth user
      console.error('Database error creating user profile:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user profile'
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: authData.user.id,
          email: authData.user.email,
          firstName,
          lastName,
          role,
          username
        },
        token: authData.session?.access_token || 'registration_pending',
        session: authData.session,
        needsEmailConfirmation: !authData.session
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

/**
 * Login user with Supabase Auth
 * POST /api/auth/login
 */
router.post('/login', loginValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return res.status(401).json({
        success: false,
        error: authError.message
      });
    }

    if (!authData.user || !authData.session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Get user profile from our Users table
    const { data: userProfile, error: profileError } = await supabaseClient
      .from('Users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found'
      });
    }

    // Check if user is active
    if (!userProfile.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    // Update last login
    await supabaseClient
      .from('Users')
      .update({ lastLogin: new Date().toISOString() })
      .eq('id', authData.user.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: userProfile.id,
          email: userProfile.email,
          username: userProfile.username,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          role: userProfile.role,
          organization: userProfile.organization,
          department: userProfile.department,
          experience: userProfile.experience,
          preferredLanguage: userProfile.preferredLanguage
        },
        token: authData.session.access_token,
        session: authData.session
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/profile
 */
router.get('/profile', authenticateSupabase, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
});

/**
 * Logout user
 * POST /api/auth/logout
 */
router.post('/logout', authenticateSupabase, async (req, res) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
      // Sign out from Supabase (this will invalidate the token)
      const { error } = await supabaseClient.auth.signOut();
      
      if (error) {
        console.error('Supabase logout error:', error);
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

/**
 * Verify token endpoint
 * GET /api/auth/verify
 */
router.get('/verify', authenticateSupabase, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
});

/**
 * Refresh session
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required'
      });
    }

    const { data, error } = await supabaseClient.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        session: data.session
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

module.exports = router; 