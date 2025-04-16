'use client';

import React, { useState } from 'react';
import PdfViewerModal from './PdfViewerModal';

// Example component that demonstrates how to use PdfViewerModal
export default function PdfViewerExample() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPdf, setCurrentPdf] = useState({
    url: '',
    page: 1
  });
  const [chunkText, setChunkText] = useState('');

  // Example function to open PDF viewer (similar to what will be used in ChatInterface)
  const openPdf = (url: string, pageNumber: number = 1, text: string = '') => {
    setCurrentPdf({
      url,
      page: pageNumber
    });
    setChunkText(text);
    setIsModalOpen(true);
  };

  // Test files for demonstration
  const exampleSystemPdf = '/api/documents/system/sample.pdf';
  const exampleUserPdf = '/api/documents/user/123456789';
  
  // Example chunk text for demonstration
  const exampleChunkText = "This is example text from a document chunk that would be returned from the API. It represents the content that was used to generate the AI response.";
  
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">PDF Viewer Example</h2>
      
      <div className="space-y-4">
        <button
          onClick={() => openPdf(exampleSystemPdf, 1, exampleChunkText)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Open System PDF (Page 1)
        </button>
        
        <button
          onClick={() => openPdf(exampleUserPdf, 2, exampleChunkText + " Additional content for the second example.")}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 block"
        >
          Open User PDF (Page 2)
        </button>
      </div>
      
      {/* PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        fileUrl={currentPdf.url}
        initialPageNumber={currentPdf.page}
        chunkText={chunkText}
      />
      
      <div className="mt-6 text-sm text-gray-600">
        <p>This example demonstrates how to implement the PDF viewer modal.</p>
        <p>In the real implementation, this will be integrated with the ChatInterface component.</p>
      </div>
    </div>
  );
} 