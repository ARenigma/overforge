"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  experience?: string;
  preferredLanguage?: string;
  organization?: string;
  department?: string;
}

interface AuthContextType {
  user: User | null;
  supabaseUser: any | null;
  token: string | null;
  session: any | null;
  loading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  signup: (userData: SignupData) => Promise<boolean>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  getAuthHeaders: () => { [key: string]: string };
  getFreshToken: () => Promise<string | null>;
  isTokenExpired: (bufferMinutes?: number) => boolean;
  apiRequest: (url: string, options?: RequestInit) => Promise<Response>;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface SignupData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize auth state and listen for changes
  useEffect(() => {
    let mounted = true;

    // Get initial session
    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Supabase auth - Error getting session:", error);
          if (mounted) {
            setError(error.message);
            setLoading(false);
          }
          return;
        }

        if (initialSession?.user && mounted) {
          console.log(
            "Supabase auth - Initial session found:",
            initialSession.user.id,
          );
          await handleAuthUser(
            initialSession.user,
            initialSession.access_token,
            initialSession,
          );
        } else {
          console.log("Supabase auth - No initial session found");
          if (mounted) setLoading(false);
        }
      } catch (error) {
        console.error("Supabase auth - Error initializing:", error);
        if (mounted) {
          setError(
            error instanceof Error ? error.message : "Initialization failed",
          );
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log("Supabase auth - State change:", event, session?.user?.id);

      if (event === "SIGNED_IN" && session?.user) {
        await handleAuthUser(session.user, session.access_token, session);
        setError(null);
      } else if (event === "SIGNED_OUT") {
        handleSignOut();
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        console.log("Supabase auth - Token refreshed automatically");
        setToken(session.access_token);
        setSession(session);
        scheduleTokenRefresh(session);
      } else if (event === "USER_UPDATED" && session?.user) {
        console.log("Supabase auth - User updated");
        setSupabaseUser(session.user);
      }

      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearRefreshTimeout();
    };
  }, []);

  // Clear refresh timeout
  const clearRefreshTimeout = () => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  };

  // Schedule automatic token refresh
  const scheduleTokenRefresh = (session: any) => {
    if (!session?.expires_at) return;

    clearRefreshTimeout();

    // Calculate time until token expires (refresh 5 minutes before expiry)
    const expiresAt = session.expires_at * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilRefresh = expiresAt - now - 5 * 60 * 1000; // 5 minutes before expiry

    if (timeUntilRefresh > 0) {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshToken();
      }, timeUntilRefresh);

      console.log(
        `Supabase auth - Token refresh scheduled in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`,
      );
    } else {
      // Token is already expired or expires very soon, refresh immediately
      console.log("Supabase auth - Token expired, refreshing immediately");
      refreshToken();
    }
  };

  const handleAuthUser = async (
    supabaseUser: any,
    accessToken: string,
    session: any,
  ) => {
    try {
      setSupabaseUser(supabaseUser);
      setToken(accessToken);
      setSession(session);

      // Schedule token refresh
      if (session) {
        scheduleTokenRefresh(session);
      }

      // Try to get user data from Users table
      const { data: userData, error: userError } = await supabase
        .from("Users")
        .select("*")
        .eq("id", supabaseUser.id)
        .single();

      if (userError) {
        console.log(
          "Supabase auth - User not found in Users, creating profile...",
        );

        // Create user profile if it doesn't exist
        const newUser = {
          id: supabaseUser.id,
          email: supabaseUser.email,
          firstName: supabaseUser.user_metadata?.firstName || "User",
          lastName: supabaseUser.user_metadata?.lastName || "",
          role: supabaseUser.user_metadata?.role || "interviewer",
          organization: supabaseUser.user_metadata?.organization || "",
          department: supabaseUser.user_metadata?.department || "",
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const { error: insertError } = await supabase
          .from("Users")
          .insert([newUser]);

        if (insertError) {
          console.error(
            "Supabase auth - Error creating user profile:",
            insertError,
          );
          setError("Failed to create user profile");
        } else {
          console.log("Supabase auth - User profile created successfully");
          setUser(newUser);
        }
      } else {
        console.log("Supabase auth - User found in Users:", userData.email);
        setUser(userData);
      }
    } catch (error) {
      console.error("Supabase auth - Error handling auth user:", error);
      setError("Failed to load user profile");
    }
  };

  const handleSignOut = () => {
    console.log("Supabase auth - Signing out");
    clearRefreshTimeout();
    setUser(null);
    setSupabaseUser(null);
    setToken(null);
    setSession(null);
    setError(null);
  };

  // Manual token refresh function
  const refreshToken = async () => {
    if (refreshingRef.current) {
      console.log("Supabase auth - Token refresh already in progress");
      return;
    }

    refreshingRef.current = true;

    try {
      console.log("Supabase auth - Refreshing token...");
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error("Supabase auth - Token refresh failed:", error);
        setError("Session expired. Please log in again.");
        await logout();
      } else if (data.session) {
        console.log("Supabase auth - Token refreshed successfully");
        setSession(data.session);
        setToken(data.session.access_token);
        setError(null);
        scheduleTokenRefresh(data.session);
      }
    } catch (err) {
      console.error("Supabase auth - Token refresh error:", err);
      setError("Session expired. Please log in again.");
      await logout();
    } finally {
      refreshingRef.current = false;
    }
  };

  // Check if token is expired or expiring soon
  const isTokenExpired = (bufferMinutes: number = 5) => {
    if (!session?.expires_at) return true;

    const expiresAt = session.expires_at * 1000;
    const now = Date.now();
    const buffer = bufferMinutes * 60 * 1000;

    return now >= expiresAt - buffer;
  };

  // Get fresh token (refresh if needed)
  const getFreshToken = async () => {
    if (!session) return null;

    if (isTokenExpired()) {
      await refreshToken();
    }

    return session?.access_token || null;
  };

  // API request wrapper with automatic token refresh
  const apiRequest = async (url: string, options: RequestInit = {}) => {
    const freshToken = await getFreshToken();

    if (!freshToken) {
      throw new Error("No valid token available");
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${freshToken}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // If token is expired, try to refresh and retry once
    if (response.status === 401 && !(options as any)._retry) {
      console.log(
        "Supabase auth - Token expired, refreshing and retrying request...",
      );
      await refreshToken();

      const newFreshToken = await getFreshToken();
      if (newFreshToken) {
        return apiRequest(url, { ...options, _retry: true } as any);
      }
    }

    return response;
  };

  const login = async ({ email, password }: LoginCredentials) => {
    setLoading(true);
    setError(null);

    try {
      console.log("SupabaseAuth - Attempting login for:", email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log("SupabaseAuth - Raw Supabase response:", { data, error });

      if (error) {
        console.error("SupabaseAuth - Login error:", error.message);
        setError(error.message);
        return false;
      }

      if (data.user) {
        console.log("SupabaseAuth - Login successful:", data.user.id);
        console.log("SupabaseAuth - Session data:", data.session);
        // handleAuthUser will be called automatically by the auth state change listener
        return true;
      }

      console.log("SupabaseAuth - No user in response");
      return false;
    } catch (err) {
      console.error("SupabaseAuth - Login exception:", err);
      setError(err instanceof Error ? err.message : "Login failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (userData: SignupData) => {
    setLoading(true);
    setError(null);

    try {
      console.log("Supabase auth - Attempting signup for:", userData.email);

      const { data, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role,
          },
        },
      });

      if (error) {
        console.error("Supabase auth - Signup error:", error.message);
        setError(error.message);
        return false;
      }

      if (data.user) {
        console.log("Supabase auth - Signup successful:", data.user.id);
        // If email confirmation is required, the user won't be automatically logged in
        if (!data.session) {
          setError("Please check your email to confirm your account");
        }
        return true;
      }

      return false;
    } catch (err) {
      console.error("Supabase auth - Signup exception:", err);
      setError(err instanceof Error ? err.message : "Signup failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    console.log("Supabase auth - Logging out");
    setLoading(true);
    clearRefreshTimeout();

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Supabase auth - Logout error:", error);
      }
    } catch (error) {
      console.error("Supabase auth - Logout exception:", error);
    } finally {
      setLoading(false);
    }
  };

  const getAuthHeaders = (): { [key: string]: string } => {
    if (!token) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        token,
        session,
        loading,
        error,
        login,
        signup,
        logout,
        refreshToken,
        getAuthHeaders,
        getFreshToken,
        isTokenExpired,
        apiRequest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error(
      "useSupabaseAuth must be used within a SupabaseAuthProvider",
    );
  }
  return context;
}

// Export supabase client for direct use if needed
export { supabase };
