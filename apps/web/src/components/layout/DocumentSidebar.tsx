'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { FileText } from 'lucide-react'; // Use an icon
import { API_BASE_URL } from '@/lib/config';

interface SidebarDocument {
  _id: string;
  originalFileName: string;
}

// Added: Define props for the component
interface DocumentSidebarProps {
  onDocumentClick: (docId: string, sourceType: 'system', originalFileName: string) => void; // Added originalFileName
}

const DocumentSidebar: React.FC<DocumentSidebarProps> = ({ onDocumentClick }) => { // Destructure prop
  const [documents, setDocuments] = useState<SidebarDocument[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { token, logout } = useAuth();

  useEffect(() => {
    // This effect depends on the token. If the token isn't loaded yet, it shouldn't run.
    // If the token becomes null (logout), it should clear the documents.
    if (!token) {
      setDocuments([]);
      setError(null); // Clear error if logged out
      setIsLoading(false); // Ensure loading is false if not fetching
      return; // Don't fetch if not logged in
    }

    let isMounted = true; // Prevent state updates on unmounted component
    const fetchDocuments = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/system-kb/`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!isMounted) return; // Don't update state if component unmounted

        if (response.status === 401) {
          setError('Authentication failed. Please log in again.');
          logout();
          return;
        }

        if (!response.ok) {
          let errorMessage = `Failed to fetch documents: ${response.status}`;
           try {
             const errorData = await response.json();
             errorMessage = errorData.message || errorMessage;
           } catch (e) { /* Ignore JSON parsing errors */ }
          throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.documents)) {
          // Only store necessary fields
          const mappedDocs = data.documents.map((doc: any) => ({
            _id: doc._id, // System KB docs have _id from MongoDB
            originalFileName: doc.originalFileName, // They have originalFileName
          }));
          setDocuments(mappedDocs);
        } else {
          throw new Error(data.message || 'Invalid response format from server.');
        }
      } catch (err) {
         if (!isMounted) return; // Don't update state if component unmounted
        console.error('Error fetching documents for sidebar:', err);
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        setDocuments([]);
      } finally {
         if (isMounted) {
            setIsLoading(false);
         }
      }
    };

    fetchDocuments();

    // Cleanup function to set isMounted to false when the component unmounts
    return () => {
        isMounted = false;
    };
  }, [token, logout]); // Re-fetch if token changes

  return (
    <div className="p-4 h-full overflow-y-auto bg-white dark:bg-gray-800 flex flex-col">
      <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100 sticky top-0 bg-white dark:bg-gray-800 py-2 -mt-4 px-2 z-10 flex-shrink-0">
        System Knowledge Base
      </h2>
      <div className="flex-grow overflow-y-auto">
        {isLoading && <div className="flex justify-center items-center h-20 p-2 text-gray-500 dark:text-gray-400">Loading...</div>}
        {error && <p className="text-red-600 dark:text-red-400 text-sm px-2">{error}</p>}
        {!isLoading && !error && documents.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-sm px-2">No system documents found.</p>
        )}
        {!isLoading && !error && documents.length > 0 && (
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc._id}>
                <button
                  onClick={() => onDocumentClick(doc._id, 'system', doc.originalFileName)}
                  title={doc.originalFileName}
                  className="w-full text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1.5 rounded flex items-center space-x-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <FileText size={16} className="flex-shrink-0" />
                  <span className="truncate flex-grow">
                      {doc.originalFileName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DocumentSidebar; 