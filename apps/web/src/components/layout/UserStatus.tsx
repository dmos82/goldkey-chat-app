'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function UserStatus() {
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading user...</div>;
  }

  return (
    <div className="text-sm">
      {user ? (
        <div className="flex items-center space-x-3">
          <span>Welcome, <span className="font-medium">{user.username}</span>!</span>
          <button 
            onClick={logout}
            className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 text-xs font-medium"
          >
            Logout
          </button>
        </div>
      ) : (
        <Link href="/auth" className="text-blue-600 hover:underline font-medium">
          Login
        </Link>
      )}
    </div>
  );
} 