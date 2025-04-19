// Use require with legacy path for pdfjs-dist in Node.js
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// --- Set Worker Source ---
try {
    const workerSrcPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcPath;
    console.log(`[pdfUtils] Set pdfjs workerSrc to: ${workerSrcPath}`);
} catch (error) {
    console.error("[pdfUtils] Failed to resolve pdf.worker.js path. PDF processing might fail.", error);
    // Throw an error here to prevent the server starting with broken PDF processing
    throw new Error("Failed to configure PDF worker. Cannot start server.");
}
// -------------------------

export interface PageText {
    pageNumber: number;
    text: string;
}

/**
 * Custom render callback for pdf-parse that preserves page numbers
 */
export function renderPageWithNumber(pageData: any): Promise<string> {
  const renderOptions = {
    normalizeWhitespace: false,
    disableCombineTextItems: false
  };

  return pageData.getTextContent(renderOptions)
    .then((textContent: any) => {
      let lastY: number | undefined;
      let text = '';

      for (const item of textContent.items) {
        if (lastY === item.transform[5] || !lastY) {
          text += item.str;
        } else {
          text += '\\n' + item.str;
        }
        lastY = item.transform[5];
      }

      return text;
    });
}

/**
 * Extracts text from a PDF buffer page by page using pdfjs-dist.
 */
export async function extractPdfTextWithPages(pdfBuffer: Buffer): Promise<PageText[]> {
    const pages: PageText[] = [];
    // Load the PDF document from the buffer
    const loadingTask = pdfjsLib.getDocument({ 
        data: new Uint8Array(pdfBuffer) // pdfjs expects Uint8Array
        // No cMapUrl or standardFontDataUrl needed when worker is set correctly
    });

    try {
        const pdfDocument = await loadingTask.promise;
        console.log(`[pdfUtils] PDF loaded with ${pdfDocument.numPages} pages using pdfjs-dist.`);

        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const textContent = await page.getTextContent();
            
            // Join text items, preserving some structure (e.g., line breaks)
            let pageText = '';
            let lastY: number | undefined;
            textContent.items.forEach((item: any) => { // Use 'any' for simplicity, or define TextItem interface
                if (lastY !== undefined && item.transform[5] < lastY) { // Heuristic for new line
                    pageText += '\\n';
                }
                pageText += item.str + ' '; // Add space between items
                lastY = item.transform[5];
            });

            const trimmedText = pageText.trim().replace(/\s+/g, ' '); // Normalize whitespace

            if (trimmedText) {
                 pages.push({
                    pageNumber: i,
                    text: trimmedText
                });
            } else {
                 console.log(`[pdfUtils] Page ${i} yielded no text content.`);
            }
        }
        console.log(`[pdfUtils] Successfully extracted text from ${pages.length} pages using pdfjs-dist.`);
    } catch (error: any) {
        console.error('[pdfUtils] Error extracting PDF text with pdfjs-dist:', error);
        // Rethrow or handle error appropriately
        throw new Error(`Failed to extract text using pdfjs-dist: ${error.message || String(error)}`);
    }
    
    return pages;
}

/**
 * Chunks text while preserving page number information
 */
export function chunkTextWithPages(
  pages: PageText[],
  chunkSize: number = 750,
  overlap: number = 150
): { text: string; pageNumbers: number[]; }[] {
  const chunks: { text: string; pageNumbers: number[]; }[] = [];
  
  // Process each page
  pages.forEach(({ pageNumber, text }) => {
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + chunkSize, text.length);
      const chunk = text.substring(i, end);
      
      // Only add non-empty chunks
      if (chunk.trim()) {
        chunks.push({
          text: chunk.trim(),
          pageNumbers: [pageNumber]
        });
      }
      
      i += chunkSize - overlap;
      if (i < overlap && end === text.length) break;
      if (i >= end) i = end;
    }
  });
  
  return chunks;
} 