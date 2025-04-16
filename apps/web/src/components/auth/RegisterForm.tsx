'use client';

import React, { useState, FormEvent } from 'react';
import { registerUser } from '@/services/authService'; // <-- Import service

export default function RegisterForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false); // <-- Added loading state
  const [error, setError] = useState<string | null>(null); // <-- Added error state
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // <-- Added success state

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const credentials = { username, password };
      console.log('Attempting registration with:', credentials);
      const response = await registerUser(credentials);
      console.log('Registration successful:', response);
      setSuccessMessage('Registration successful! You can now log in.');
      // Clear form on success
      setUsername('');
      setPassword('');
      // TODO: Optionally redirect to login or show login form clearly

    } catch (err: any) {
      const errorMessage = err?.error || 'An unknown error occurred during registration.';
      console.error('Registration failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded shadow">
      <h2 className="text-xl font-semibold">Register</h2>
      {/* Error Display Area */}
      {error && (
        <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="text-sm">{error}</p>
        </div>
      )}
      {/* Success Display Area */}
      {successMessage && (
         <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          <p className="text-sm">{successMessage}</p>
        </div>       
      )}
      <div>
        <label htmlFor="register-username" className="block text-sm font-medium text-gray-700">
          Username
        </label>
        <input
          id="register-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={isLoading}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
        />
      </div>
      <div>
        <label htmlFor="register-password" className="block text-sm font-medium text-gray-700">
          Password (min 6 characters)
        </label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6} // Basic client-side validation
          disabled={isLoading}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-yellow-400 hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Registering...' : 'Register'}
      </button>
    </form>
  );
} 