'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL } from '@/lib/config';

interface SearchResult {
  _id: string;
  originalFileName: string;
  uploadTimestamp: string;
  score?: number; // Optional score from text search
}

const FilenameSearch: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { token, logout } = useAuth(); // Get token and logout function from context

  const handleSearch = useCallback(async () => {
    if (!token) {
      setError('You must be logged in to search.');
      logout(); // Optional: Log out if token is unexpectedly missing
      return;
    }

    if (!searchQuery.trim()) {
      setError('Please enter a search term.');
      setResults([]); // Clear results if query is empty
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]); // Clear previous results

    try {
      const encodedQuery = encodeURIComponent(searchQuery.trim());
      const response = await fetch(`${API_BASE_URL}/api/search/filename?q=${encodedQuery}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json', // Though not strictly needed for GET
        },
      });

      if (response.status === 401) {
        setError('Authentication failed. Please log in again.');
        logout(); // Log out on authentication error
        return;
      }

      if (!response.ok) {
        // Attempt to read error message from backend response
        let errorMessage = `Search failed with status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
        } catch (e) {
            // Ignore if response body isn't JSON or is empty
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.results)) {
        setResults(data.results);
        if (data.results.length === 0) {
            setError('No documents found matching your query.');
        }
      } else {
        throw new Error(data.message || 'Invalid response format from server.');
      }
    } catch (err) {
      console.error('Filename search error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during search.');
      setResults([]); // Ensure results are cleared on error
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, token, logout]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    // Optionally clear error when user types
    if (error) {
        setError(null);
    }
  };

  // Prevent form submission from reloading the page
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSearch();
  };

  const getDocumentUrl = (docId: string): string => {
     // TODO: Use a more robust way to construct this URL, potentially involving router or config
     // const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
     return `${API_BASE_URL}/api/documents/user/${docId}`; // Direct download/view link for now
  }

  const handleResultClick = (docId: string) => {
    // Remove local apiUrl definition
    // const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    // Construct the URL to fetch the document content or viewer page
    // This might need adjustment based on how PDF viewing is implemented
    // Example: Assuming a route exists to fetch the raw PDF or its structured content
    // const documentUrl = `${apiUrl}/api/documents/${docId}`; 
    // For now, just log, actual navigation/fetching might happen elsewhere
    console.log(`Clicked on result, would fetch/navigate to docId: ${docId}`);
  };

  return (
    <div className="p-4 border rounded-md shadow-sm bg-white dark:bg-gray-800">
      <form onSubmit={handleSubmit} className="flex items-center space-x-2 mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={handleInputChange}
          placeholder="Search filenames..."
          className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          aria-label="Search filenames"
        />
        <button
          type="submit"
          disabled={isLoading || !searchQuery.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="text-red-600 dark:text-red-400 mb-3" role="alert">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-gray-100">Results:</h3>
          <ul className="space-y-1 list-disc list-inside">
            {results.map((doc) => (
              <li key={doc._id} className="text-gray-700 dark:text-gray-300">
                <a
                  // Consider opening in a new tab or using a modal viewer later
                  href={getDocumentUrl(doc._id)}
                  target="_blank" // Open in new tab for now
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
                >
                  {doc.originalFileName}
                </a>
                 {/* Optionally display score or timestamp */}
                 {/* <span className="text-xs text-gray-500 ml-2">(Score: {doc.score?.toFixed(2)})</span> */}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FilenameSearch; 