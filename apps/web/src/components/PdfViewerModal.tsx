'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Download } from 'lucide-react';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  initialPageNumber: number;
  chunkText?: string;
  title?: string;
}

const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  initialPageNumber = 1,
  chunkText = '',
  title = 'Document Viewer'
}) => {
  // Log Received Props (including title)
  console.log('[PdfViewerModal] Received props:', { isOpen, fileUrl, initialPageNumber, chunkText, title });

  const [numPages, setNumPages] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(initialPageNumber);
  
  // Memoize the normalized chunk text
  const normalizedChunkText = useMemo(() => {
    // Corrected regex to use single backslash: /\s+/g
    const text = chunkText ? chunkText.toLowerCase().replace(/\s+/g, ' ').trim() : '';
    // Log Memoized Value
    console.log('[PdfViewerModal] Memoized normalizedChunkText:', text);
    return text;
  }, [chunkText]);

  // Custom text renderer for highlighting, wrapped in useCallback
  const customTextRenderer = useCallback((textItem: { str: string }) => {
    // Log inputs right away
    console.log('[Renderer] Comparing:', { itemStr: textItem.str, normChunk: normalizedChunkText });

    // Always escape text first
    const escapedText = textItem.str.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (!normalizedChunkText || !textItem?.str) {
       // console.log('[Renderer] Exiting early - no chunk or item string.');
      return escapedText; // Return escaped text even on early exit
    }

    // Corrected regex to use single backslash: /\s+/g
    const normalizedTextItem = textItem.str.toLowerCase().replace(/\s+/g, ' ').trim();

    // Log before the check
    console.log('[Renderer] Normalized comparison:', { normalizedTextItem, normalizedChunkText });

    if (normalizedChunkText.includes(normalizedTextItem) && normalizedTextItem.length > 0) { // Add check for non-empty normalized item
      // Log match found
      console.log('[Renderer] !!! Match Found !!! Highlighting:', escapedText);
      return `<mark style="background-color: rgba(255, 255, 0, 0.4)">${escapedText}</mark>`;
    }

    // console.log('[Renderer] No match for this item.');
    return escapedText; // Return escaped text if not highlighted
  }, [normalizedChunkText]);

  // Reset page number when fileUrl changes
  useEffect(() => {
    // Reset to initialPageNumber whenever file changes
    setCurrentPage(initialPageNumber > 0 ? initialPageNumber : 1);
    // Reset loading and error states too
    setLoading(true);
    setLoadError(null);
  }, [fileUrl, initialPageNumber]);

  // Initialize PDF.js worker
  useEffect(() => {
    try {
      // Configure PDF.js worker using local copy
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`; // Path relative to public directory
      console.log(`[PdfViewerModal] Set PDF worker source to local copy: ${pdfjs.GlobalWorkerOptions.workerSrc}`);
    } catch (error) {
      console.error('[PdfViewerModal] Error setting up PDF worker:', error);
    }
  }, []);

  // Add keyboard navigation
  useEffect(() => {
    if (!isOpen) return; // Only active when modal is open
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        // Next page
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        // Previous page
        handlePreviousPage();
      } else if (e.key === 'Home') {
        // First page
        setCurrentPage(1);
      } else if (e.key === 'End' && numPages) {
        // Last page
        setCurrentPage(numPages);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentPage, numPages]); // Re-attach when these values change

  if (!isOpen) return null;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
    setLoading(false);
  }

  function onDocumentLoadError(error: Error): void {
    console.error('Error while loading PDF:', error);
    setLoadError(error);
    setLoading(false);
  }
  
  // Page navigation handlers
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prevPage => prevPage - 1);
    }
  };
  
  const handleNextPage = () => {
    if (numPages && currentPage < numPages) {
      setCurrentPage(prevPage => prevPage + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black bg-opacity-75 flex justify-center items-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-background dark:bg-card rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex justify-between items-center p-4 border-b space-x-4">
          <h2 className="text-xl font-semibold flex items-center truncate flex-grow" title={title}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="truncate">{title}</span>
          </h2>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <a
              href={fileUrl}
              download={title || 'document.pdf'}
              className="flex items-center px-3 py-1.5 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              title={`Download ${title}`}
              style={{ pointerEvents: fileUrl.startsWith('blob:') ? 'auto' : 'none', opacity: fileUrl.startsWith('blob:') ? 1 : 0.5 }}
            >
              <Download size={16} className="mr-1.5" />
              Download
            </a>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 rounded-full p-1 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Modal content */}
        <div className="flex-1 overflow-auto p-4 flex flex-col items-center">
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 w-full">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-lg text-gray-600">Loading document...</p>
            </div>
          )}
          
          {loadError && (
            <div className="bg-red-50 text-red-600 rounded-lg p-6 mt-4 max-w-lg mx-auto text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-semibold text-lg mt-2">Failed to load PDF</p>
              <p className="mt-2">{loadError.message || 'Please try again or use a different document.'}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Close
              </button>
            </div>
          )}
          
          {/* Document toolbar */}
          {numPages && !loadError && !loading && (
            <div className="w-full mb-2 flex items-center justify-between bg-gray-100 rounded-md p-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage <= 1}
                  className={`p-1 rounded ${currentPage <= 1 ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-200'}`}
                  title="First page"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
                
                <button
                  onClick={handlePreviousPage}
                  disabled={currentPage <= 1}
                  className={`p-1 rounded flex items-center ${currentPage <= 1 ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-200'}`}
                  title="Previous page"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="ml-1 hidden sm:inline text-xs">Previous</span>
                </button>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={numPages}
                    value={currentPage}
                    onChange={(e) => {
                      const page = parseInt(e.target.value);
                      if (page >= 1 && page <= numPages) {
                        setCurrentPage(page);
                      }
                    }}
                    className="w-12 px-2 py-1 border rounded text-center"
                    aria-label="Go to page"
                  />
                  <span className="text-gray-600">of {numPages}</span>
                </div>
                
                <button
                  onClick={handleNextPage}
                  disabled={numPages ? currentPage >= numPages : true}
                  className={`p-1 rounded flex items-center ${numPages && currentPage < numPages ? 'text-gray-700 hover:bg-gray-200' : 'text-gray-400'}`}
                  title="Next page"
                >
                  <span className="mr-1 hidden sm:inline text-xs">Next</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                
                <button
                  onClick={() => numPages && setCurrentPage(numPages)}
                  disabled={numPages ? currentPage >= numPages : true}
                  className={`p-1 rounded ${numPages && currentPage < numPages ? 'text-gray-700 hover:bg-gray-200' : 'text-gray-400'}`}
                  title="Last page"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              
              <div className="relative group">
                <button
                  className="p-1 rounded text-gray-700 hover:bg-gray-200"
                  title="Keyboard shortcuts"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <div className="absolute right-0 mt-2 w-64 p-3 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 text-xs text-gray-700">
                  <p className="font-semibold mb-1">Keyboard Shortcuts:</p>
                  <ul className="space-y-1">
                    <li><span className="font-medium">← or PageUp:</span> Previous page</li>
                    <li><span className="font-medium">→ or PageDown:</span> Next page</li>
                    <li><span className="font-medium">Home:</span> First page</li>
                    <li><span className="font-medium">End:</span> Last page</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          
          <div className="max-h-[calc(90vh-10rem)] overflow-auto w-full flex justify-center bg-gray-200 p-4">
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
            >
              <Page
                key={`page_${currentPage}`}
                pageNumber={currentPage}
                renderTextLayer={true}
                customTextRenderer={customTextRenderer}
                className="max-w-full shadow-lg"
              />
            </Document>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfViewerModal; 