'use client';

import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';

interface FileUploadProps {
  onUploadSuccess: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const { token } = useAuth();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError('');
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    if (!token) {
      setError('Error: You must be logged in to upload files.');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const headers: HeadersInit = {
        'Authorization': `Bearer ${token}`,
      };
      const response = await fetch('http://localhost:3001/api/documents/upload', {
        method: 'POST',
        headers: headers,
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `HTTP error! status: ${response.status}`);
      }
      setError(`Success! ${result?.document?.fileName ?? 'File'} uploaded.`);
      setFile(null);
      const fileInput = event.target as HTMLFormElement;
      fileInput.reset();
      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (error) {
      setError(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="p-4 border rounded-md shadow-sm bg-white dark:bg-gray-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
         Upload Document
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Select PDF or TXT file (Max 10MB):
          </label>
          <div className="mt-1 flex items-center justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
            <div className="space-y-1 text-center">
              <div className="flex text-sm text-gray-600 dark:text-gray-400">
                <label
                  htmlFor="file-upload"
                  className="relative cursor-pointer bg-white dark:bg-gray-700 rounded-md font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 p-1"
                >
                  <span>Upload a file</span>
                  <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.txt" />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              {file && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Selected: {file.name}</p>}
            </div>
          </div>
        </div>

        {error && <p className={`text-sm ${error.startsWith('Success') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{error}</p>}

        {isUploading && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
          </div>
        )}

        <button
          type="submit"
          disabled={!file || isUploading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? `Uploading...` : 'Upload'}
        </button>
      </form>
    </div>
  );
};

export default FileUpload; 