const { supabase } = require("../config/supabase");

/**
 * Supabase Authentication Middleware
 * Alternative to JWT-based authentication using Supabase Auth
 *
 * Handles token validation, expiration, and user profile management
 */
const authenticateSupabase = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "No token provided",
        message: "Authorization header must be in format: Bearer <token>",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) {
      console.error("Supabase auth error:", error.message);

      // Check if token is expired
      if (
        error.message.includes("expired") ||
        error.message.includes("JWT") ||
        error.code === "invalid_token"
      ) {
        return res.status(401).json({
          error: "Token expired",
          message:
            "Access token has expired. Please refresh your token or log in again.",
          code: "TOKEN_EXPIRED",
          refresh_required: true,
        });
      }

      // Check if token is invalid
      if (
        error.message.includes("invalid") ||
        error.message.includes("malformed")
      ) {
        return res.status(401).json({
          error: "Invalid token",
          message: "The provided token is invalid or malformed.",
          code: "INVALID_TOKEN",
        });
      }

      // Generic auth error
      return res.status(401).json({
        error: "Authentication failed",
        message: error.message,
        code: "AUTH_ERROR",
      });
    }

    if (!user) {
      return res.status(401).json({
        error: "User not found",
        message: "Token is valid but user does not exist",
      });
    }

    // Get user details from our Users table
    let { data: userData, error: userError } = await supabase
      .from("Users")
      .select("*")
      .eq("email", user.email)
      .single();

    // If user doesn't exist in Users table, create them
    if (userError || !userData) {
      console.log(
        `🔧 User ${user.email} not found in Users table, creating...`,
      );

      const { data: newUser, error: createError } = await supabase
        .from("Users")
        .insert([
          {
            id: user.id, // Use Supabase Auth UUID
            email: user.email,
            username: user.email.split("@")[0] + "_" + Date.now(),
            firstName: user.user_metadata?.firstName || "User",
            lastName: user.user_metadata?.lastName || "",
            role: "candidate", // Default role
            isActive: true,
            preferredLanguage: "javascript",
          },
        ])
        .select()
        .single();

      if (createError) {
        console.error(
          "Failed to create user in Users table:",
          createError.message,
        );
        return res.status(500).json({
          error: "User creation failed",
          message: "Could not create user profile",
        });
      }

      userData = newUser;
      console.log(`✅ Created user in Users table: ${userData.email}`);
    }

    // Attach user data to request
    req.user = {
      id: userData.id,
      email: userData.email,
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      supabaseUser: user,
    };

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(500).json({
      error: "Authentication failed",
      message: "Internal server error during authentication",
    });
  }
};

/**
 * Role-based authorization middleware
 * Use after authenticateSupabase
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        message: `Required role: ${allowedRoles.join(" or ")}, but user has role: ${userRole}`,
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Continues even if no token is provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Log the error for debugging but don't fail the request
      if (error && error.message.includes("expired")) {
        console.log("Optional auth: Token expired, continuing without auth");
      } else if (error) {
        console.log("Optional auth error:", error.message);
      }
      req.user = null;
      return next();
    }

    // Get user details from our Users table
    let { data: userData, error: userError } = await supabase
      .from("Users")
      .select("*")
      .eq("email", user.email)
      .single();

    // If user doesn't exist in Users table, create them
    if (userError || !userData) {
      console.log(
        `🔧 User ${user.email} not found in Users table, creating...`,
      );

      try {
        const { data: newUser, error: createError } = await supabase
          .from("Users")
          .insert([
            {
              id: user.id, // Use Supabase Auth UUID
              email: user.email,
              username: user.email.split("@")[0] + "_" + Date.now(),
              firstName: user.user_metadata?.firstName || "User",
              lastName: user.user_metadata?.lastName || "",
              role: "candidate", // Default role
              isActive: true,
              preferredLanguage: "javascript",
            },
          ])
          .select()
          .single();

        if (createError) {
          console.error(
            "Failed to create user in Users table:",
            createError.message,
          );
          req.user = null;
          return next();
        }

        userData = newUser;
        console.log(`✅ Created user in Users table: ${userData.email}`);
      } catch (createError) {
        console.error("Error creating user:", createError);
        req.user = null;
        return next();
      }
    }

    req.user = {
      id: userData.id,
      email: userData.email,
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      supabaseUser: user,
    };

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateSupabase,
  requireRole,
  optionalAuth,
};
