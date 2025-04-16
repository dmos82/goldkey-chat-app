'use client';

import React, { ReactNode, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't do anything while loading
    if (isLoading) {
      return;
    }

    // If not loading and no user, redirect to login if not already there
    if (!user && pathname !== '/auth') {
      console.log('[ProtectedRoute] No user found, redirecting to /auth from', pathname);
      router.replace('/auth');
    }

    // Optional: If user is logged in and tries to access /auth, redirect to home
    if (user && pathname === '/auth') {
      console.log('[ProtectedRoute] User found, redirecting to / from /auth');
      router.replace('/');
    }

  }, [isLoading, user, router, pathname]);

  // Show loading indicator while checking auth status
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Checking authentication...</div>;
  }

  // If loading is finished, but we are about to redirect (no user, not on /auth page), show loading/null
  if (!user && pathname !== '/auth') {
    // Render loading or null while redirecting to prevent flashing the protected content
    return <div className="flex items-center justify-center min-h-screen">Redirecting...</div>; 
  }
  
  // If user is logged in OR if user is null but we are on the /auth page, render children
  if (user || pathname === '/auth') {
    return <>{children}</>;
  }

  // Fallback case, should technically not be reached due to logic above
  return null; 
} 