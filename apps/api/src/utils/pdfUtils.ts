import pdf from 'pdf-parse';

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
          text += '\n' + item.str;
        }
        lastY = item.transform[5];
      }

      return text;
    });
}

/**
 * Extracts text from a PDF buffer with page numbers
 */
export async function extractPdfTextWithPages(pdfBuffer: Buffer): Promise<PageText[]> {
  // Array to store text from each page
  const pages: PageText[] = [];
  
  const data = await pdf(pdfBuffer);
  
  // Process each page
  for (let i = 0; i < data.numpages; i++) {
    const pageNum = i + 1;
    const text = data.text; // This contains the text of the current page
    
    if (text && text.trim()) {
      pages.push({
        pageNumber: pageNum,
        text: text.trim()
      });
    }
  }
  
  return pages;
}

/**
 * Chunks text while preserving page number information
 */
export function chunkTextWithPages(
  pages: PageText[],
  chunkSize: number = 1000,
  overlap: number = 100
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