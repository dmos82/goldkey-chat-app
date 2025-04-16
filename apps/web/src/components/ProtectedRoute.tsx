'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation'; // Use next/navigation for App Router
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until loading is finished before checking user
    if (!isLoading) {
      if (!user) {
        console.log('[ProtectedRoute] User not authenticated, redirecting to /auth');
        router.push('/auth');
      }
    }
  }, [user, isLoading, router]);

  // Show loading indicator or null while checking auth state
  if (isLoading) {
    // TODO: Replace with a proper loading spinner/skeleton screen
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  // If loading is done and user exists, render children
  if (user) {
    return <>{children}</>;
  }

  // If loading is done and user doesn't exist (should have been redirected, but fallback)
  return null;
};

export default ProtectedRoute; 