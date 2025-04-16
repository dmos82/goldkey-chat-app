'use client';

import React, { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext'; // Adjust path as needed
import { Loader2 } from 'lucide-react'; // Example loading icon

interface AdminProtectedRouteProps {
  children: ReactNode;
}

const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect logic runs only after loading is complete and on the client-side
    if (!isLoading) {
      if (!token || !user) {
        console.log('AdminProtectedRoute: Not authenticated, redirecting to /auth');
        router.push('/auth');
      } else if (user.role !== 'admin') {
        console.log('AdminProtectedRoute: Not admin, redirecting to /');
        router.push('/'); // Redirect non-admins to home page
      }
    }
  }, [isLoading, token, user, router]);

  if (isLoading) {
    // Show a loading indicator while checking auth status
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  // If authenticated and role is admin, render the children
  if (token && user && user.role === 'admin') {
    return <>{children}</>;
  }

  // Fallback: Return null or a minimal component while redirecting
  // This prevents rendering children briefly before redirect kicks in
  return null; 
};

export default AdminProtectedRoute; 