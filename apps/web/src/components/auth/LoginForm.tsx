'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser } from '@/services/authService';
import { useAuth, AuthenticatedUser } from '@/context/AuthContext';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { login } = useAuth();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log('[LoginForm] handleSubmit triggered.');
    setError(null);
    setIsLoading(true);

    try {
      const credentials = { username, password };
      console.log('[LoginForm] Credentials prepared:', credentials);
      console.log('[LoginForm] Calling loginUser service...');
      const response = await loginUser(credentials);
      console.log('[LoginForm] loginUser service call completed.');
      console.log('[LoginForm] Login API response received:', response);

      if (response.token && response.userId && response.username && response.role) {
        const userData: AuthenticatedUser = {
          id: response.userId,
          username: response.username,
          role: response.role,
        };
        console.log('[LoginForm] Data being passed to AuthContext.login:', userData);
        login(response.token, userData);
        console.log('AuthContext updated. Scheduling redirect...');
        
        // Delay redirect slightly to allow state update to propagate
        setTimeout(() => {
            console.log('Executing delayed redirect to /');
            router.push('/'); 
        }, 50); // Small delay (e.g., 50ms)

      } else {
        console.error('[LoginForm] Login response missing required fields:', response);
        setError('Login failed: Incomplete user data received from server.');
      }

    } catch (err: any) {
      const errorMessage = err?.error || 'An unknown error occurred during login.';
      console.error('[LoginForm] Error during login process:', err);
      setError(errorMessage);
    } finally {
      console.log('[LoginForm] Setting isLoading to false.');
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded shadow">
      <h2 className="text-xl font-semibold">Login</h2>
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="text-sm">{error}</p>
        </div>
      )}
      <div>
        <label htmlFor="login-username" className="block text-sm font-medium text-gray-700">
          Username
        </label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={isLoading}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-yellow-400 hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
} 