import fs from 'fs/promises';
import { generateEmbeddings } from './openaiHelper'; // Assuming helper exists and handles embeddings
import { extractPdfTextWithPages, chunkTextWithPages, PageText } from './pdfUtils'; // Import necessary functions from pdfUtils

// Define a simple Chunk type (adjust as needed)
export interface Chunk {
    text: string;
    pageNumbers?: number[]; // Optional: Track page numbers for PDFs
    // Add other metadata if needed
}

// Define the return type for the processing function
interface ProcessedDocument {
    chunks: Chunk[];
    embeddings: number[][];
    totalChunks: number;
}

const MAX_CHUNK_SIZE = 1000; // Characters
const CHUNK_OVERLAP = 100; // Characters

/**
 * Reads a document file, extracts text, chunks it, and generates embeddings.
 * 
 * @param filePath Path to the temporary document file.
 * @param originalFilename Original name of the file (used for logging).
 * @returns Promise resolving to an object with chunks, embeddings, and count.
 */
export async function processAndEmbedDocument(
    filePath: string,
    originalFilename: string
): Promise<ProcessedDocument> {
    console.log(`[DocProcessor] Starting processing for: ${originalFilename} at ${filePath}`);

    try {
        const fileBuffer = await fs.readFile(filePath);
        let pages: PageText[] = [];

        // --- Text Extraction ---
        const fileExtension = originalFilename.split('.').pop()?.toLowerCase() || '';

        if (fileExtension === 'pdf') {
            console.log(`[DocProcessor] Extracting text from PDF using pdfUtils...`);
            pages = await extractPdfTextWithPages(fileBuffer);
            console.log(`[DocProcessor] Extracted ${pages.length} pages from PDF.`);
        } else if (fileExtension === 'txt' || fileExtension === 'md') {
            const text = fileBuffer.toString('utf-8');
            pages = [{ pageNumber: 1, text: text }]; // Treat TXT/MD as single page
            console.log(`[DocProcessor] Extracted text from TXT/MD file.`);
        } else {
            console.warn(`[DocProcessor] Unsupported file type for ${originalFilename}. Skipping text extraction.`);
            return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        if (pages.length === 0 || pages.every(p => !p.text.trim())) {
            console.warn(`[DocProcessor] No text content extracted from ${originalFilename}.`);
            return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        // --- Text Chunking (Using pdfUtils) ---
        // Use the default chunk size/overlap from pdfUtils (currently 750/150)
        const chunkData = chunkTextWithPages(pages);
        const textChunks = chunkData.map(chunk => chunk.text);
        const finalChunks: Chunk[] = chunkData.map(chunk => ({ 
            text: chunk.text, 
            pageNumbers: chunk.pageNumbers 
        }));

        console.log(`[DocProcessor] Created ${finalChunks.length} chunks using pdfUtils chunker.`);

        if (finalChunks.length === 0) {
             console.warn(`[DocProcessor] Text chunking resulted in 0 chunks for ${originalFilename}.`);
             return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        // --- Generate Embeddings (Batching recommended for many chunks) ---
        // TODO: Implement batching if processing large documents
        console.log(`[DocProcessor] Generating embeddings for ${textChunks.length} chunks...`);
        const embeddings = await generateEmbeddings(textChunks);
        console.log(`[DocProcessor] Embeddings generated successfully.`);

        if (embeddings.length !== textChunks.length) {
             throw new Error(`Mismatch between chunk count (${textChunks.length}) and embedding count (${embeddings.length})`);
        }

        return {
            chunks: finalChunks,
            embeddings: embeddings,
            totalChunks: finalChunks.length,
        };

    } catch (error: any) {
        console.error(`[DocProcessor] Error processing document ${originalFilename}:`, error);
        throw new Error(`Failed to process document: ${error.message}`);
    }
}

console.log('[DocumentProcessor] Module loaded.'); 