'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import debounce from 'lodash/debounce';
import { useAuth } from '@/context/AuthContext';
import { List, Trash2 } from 'lucide-react';

interface Document {
  id: string;
  fileName: string;
  uploadTimestamp: string;
  totalChunks: number;
  fileSize: number;
  mimeType: string;
}

interface DocumentListProps {
  onOpenFile: (docId: string, fileName: string) => void;
}

export default function DocumentList({ onOpenFile }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const { token, logout } = useAuth();

  const debouncedFetch = useCallback(
    debounce(async () => {
      if (!token) {
        console.log('[DocumentList] No token found, skipping fetch.');
        setDocuments([]);
        setIsLoading(false);
        setIsRefreshing(false);
        setError('');
        return;
      }
      
      try {
        if (activeRequestRef.current) {
          activeRequestRef.current.abort();
        }
        const abortController = new AbortController();
        activeRequestRef.current = abortController;

        setIsRefreshing(true);
        setError('');
        console.log('[DocumentList] Fetching documents with token...');
        
        const headers: HeadersInit = {
          'Authorization': `Bearer ${token}`,
        };

        const response = await fetch('http://localhost:3001/api/documents', {
          signal: abortController.signal,
          headers: headers,
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            console.warn('[DocumentList] Unauthorized (401). Logging out.');
            logout();
            setError('Session expired. Please log in again.');
            setDocuments([]);
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Failed to fetch documents');
        }
        
        console.log('[DocumentList] Received documents:', data.documents);
        setDocuments(data.documents);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to fetch documents:', error);
          if (error.message !== 'HTTP error! status: 401') {
              setError(error.message);
          }
        } else if (error instanceof Error && error.name === 'AbortError') {
            console.log('[DocumentList] Fetch aborted.');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        activeRequestRef.current = null;
      }
    }, 500),
    [token, logout]
  );

  useEffect(() => {
    setIsLoading(true);
    debouncedFetch();
    return () => {
      debouncedFetch.cancel();
      if (activeRequestRef.current) {
        activeRequestRef.current.abort();
      }
    };
  }, [token, debouncedFetch]);

  const handleDelete = async (id: string) => {
    if (!token) {
        setError('Error: You must be logged in to delete documents.');
        console.error('[handleDelete] User not logged in. Aborting delete.');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }
    if (deletingId) {
      return;
    }
    setDeletingId(id);
    setError('');
    console.log('[DocumentList] Attempting to delete document with ID:', id);
    
    try {
      const headers: HeadersInit = {
        'Authorization': `Bearer ${token}`,
      };
      const response = await fetch(`http://localhost:3001/api/documents/${id}`, {
        method: 'DELETE',
        headers: headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DocumentList] Delete request failed:', { status: response.status, error: errorData });
        if (response.status === 401) {
            console.warn('[DocumentList] Unauthorized delete (401). Logging out.');
            logout();
            setError('Session expired. Please log in again.');
        } else {
            setError(errorData.error || errorData.message || `Failed to delete (HTTP ${response.status})`);
        }
        throw new Error('Delete failed');
      }

      console.log('[DocumentList] Document deleted successfully');
      setIsLoading(true);
      debouncedFetch(); 
    } catch (error) {
      console.error('[DocumentList] Error in delete operation:', error);
      if (!(error instanceof Error && error.message === 'Delete failed')) {
          setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setDeletingId(null);
    }
  };

  let content;
  if (isLoading) {
    content = <div className="text-center py-4 text-gray-500">Loading document list...</div>;
  } else if (!token && !isLoading) {
    content = <div className="text-center py-4 text-gray-500">Please log in to view documents.</div>;
  } else if (error) {
    content = <div className="text-center py-4 text-red-600">Error: {error}</div>;
  } else if (documents.length === 0) {
    content = <p className="text-gray-500 italic pb-4">No documents uploaded yet.</p>;
  } else {
    content = (
      <div className="space-y-3 pb-4">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded shadow-sm hover:shadow">
            <a
              href="#"
              onClick={(e) => {
                 e.preventDefault();
                 onOpenFile(doc.id, doc.fileName);
              }}
              className="flex-1 cursor-pointer group p-1 rounded"
            >
              <div className="flex items-center">
                <List size={18} className="mr-2 text-gray-500 group-hover:text-indigo-600 flex-shrink-0" />
                <h3 className="font-medium text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 truncate">{doc.fileName}</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 pl-7">
                Uploaded: {new Date(doc.uploadTimestamp).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 pl-7">
                Size: {(doc.fileSize / 1024).toFixed(2)} KB • Chunks: {doc.totalChunks}
              </p>
            </a>
            <button
              onClick={() => handleDelete(doc.id)}
              disabled={deletingId === doc.id}
              className={`px-2 py-1 text-sm rounded transition-colors ml-3 flex items-center ${deletingId === doc.id
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'text-red-600 hover:text-red-800 hover:bg-red-100 dark:hover:bg-red-900/50'
              }`}
              title={`Delete ${doc.fileName}`}
            >
              <Trash2 size={14} className="mr-1" />
              {deletingId === doc.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-md shadow-sm bg-white dark:bg-gray-800">
       <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 px-4 pt-4">
         Uploaded Documents
       </h2>
       {content}
     </div>
  );
} 