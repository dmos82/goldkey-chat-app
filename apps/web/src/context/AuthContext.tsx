'use client'; // Context needs to be client-side

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useToast } from "@/components/ui/use-toast"; // Import useToast

// 1. Define Interfaces
export interface AuthenticatedUser {
  id: string;        // Or userId, depending on what backend sends
  username: string;
  role: 'admin' | 'user'; // Add user role
  // Add other relevant, non-sensitive user fields if needed
}

export interface AuthContextType {
  user: AuthenticatedUser | null;
  token: string | null;
  login: (token: string, userData: AuthenticatedUser) => void; // Signature updated implicitly by using AuthenticatedUser
  logout: () => void;
  isLoading: boolean; // To handle initial state loading from storage
  handleApiError: (error: any) => boolean; // Add new error handler function signature
}

// 2. Create Context
// Default values are provided, matching the AuthContextType structure
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 3. Create Custom Hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Define keys for localStorage
const TOKEN_STORAGE_KEY = 'authToken';
const USER_STORAGE_KEY = 'authUser';

// 4. Create AuthProvider Component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading until storage is checked
  const router = useRouter(); // Initialize useRouter
  const { toast } = useToast(); // Get toast function

  // Check localStorage on initial mount
  useEffect(() => {
    console.log('AuthProvider: Checking localStorage...');
    try {
      const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const storedUserString = localStorage.getItem(USER_STORAGE_KEY);
      
      if (storedToken && storedUserString) {
        const storedUser: AuthenticatedUser = JSON.parse(storedUserString);
        console.log('AuthProvider: Found token and user in storage');
        setToken(storedToken);
        setUser(storedUser);
      } else {
        console.log('AuthProvider: No token/user found in storage');
      }
    } catch (error) {
      // In case of parsing errors or other issues
      console.error('AuthProvider: Error reading from localStorage', error);
      // Ensure state is cleared if storage is corrupt
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      setToken(null);
      setUser(null);
    }
    setIsLoading(false); // Finished loading initial state
  }, []);

  // Login function - Accepts the updated AuthenticatedUser type
  const login = (newToken: string, userData: AuthenticatedUser) => {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData)); // userData now includes role
      setToken(newToken);
      setUser(userData); // User state now includes role
      console.log('AuthProvider: User logged in, token/user stored (including role)');
    } catch (error) {
      console.error('AuthProvider: Error writing to localStorage during login', error);
    }
  };

  // Enhanced Logout function
  const logout = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    console.log('AuthProvider: Initiating logout...');
    
    // 1. Call backend logout endpoint (optional but good practice)
    try {
      const response = await fetch(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          // Include token if needed by backend, though likely not for simple logout
          // 'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        console.warn('AuthProvider: Backend logout call failed', response.status);
        // Decide if failure here should prevent frontend logout (usually not)
      } else {
         console.log('AuthProvider: Backend logout successful');
      }
    } catch (error) {
      console.error('AuthProvider: Error calling backend logout endpoint', error);
    }

    // 2. Clear local storage and context state (always do this)
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      setToken(null);
      setUser(null);
      console.log('AuthProvider: Local token/user removed');
    } catch (error) {
      console.error('AuthProvider: Error clearing local storage during logout', error);
    }

    // 3. Redirect to login page
    router.push('/auth');
    console.log('AuthProvider: Redirecting to /auth');
  };

  // NEW: Global API Error Handler Function
  const handleApiError = (error: any): boolean => {
    console.log('[handleApiError] Checking error:', error);
    // Check for Axios-like error structure or standard Fetch Response error
    const response = error?.response || (error instanceof Response ? error : null);
    const status = response?.status;
    
    // Attempt to get response data (might need async parsing for Fetch Response)
    // For simplicity here, we assume data might be readily available or checked later.
    // A more robust implementation would handle response.json() potentially.
    const data = error?.response?.data; 

    if (status === 401) {
      // Check for our specific invalid session code in the response data
      // Need to adjust based on how the data is actually structured in the error
      // Assuming data might be { code: 'INVALID_SESSION', ... }
      if (data?.code === 'INVALID_SESSION') {
        console.warn('[Auth] INVALID_SESSION detected by handleApiError. Logging out.');
        toast({
          title: 'Session Expired',
          description: 'You have been logged out because your account was accessed from another location.',
          variant: 'destructive',
          duration: 7000
        });
        logout(); // Call the existing logout function
        return true; // Indicate that the error was handled
      } else {
        // Handle generic 401 (Unauthorized)
        console.warn('[Auth] Generic 401 detected by handleApiError. Logging out.');
        toast({ 
            title: "Unauthorized", 
            description: "Your session may have expired. Please log in again.",
            variant: "destructive"
        });
        logout();
        return true; // Indicate that the error was handled
      }
    }
    // Could add more checks here for 403 Forbidden, 500 Server Error, etc.
    
    return false; // Indicate that the error was not handled by this specific function
  };

  // Prepare context value - User object now includes role
  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    isLoading,
    handleApiError, // Provide the new handler
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 