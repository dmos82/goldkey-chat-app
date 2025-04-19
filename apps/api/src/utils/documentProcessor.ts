import fs from 'fs/promises';
import pdf from 'pdf-parse'; // Add back pdf-parse import
import { generateEmbeddings } from './openaiHelper'; // Assuming helper exists and handles embeddings
import { chunkTextWithPages, PageText } from './pdfUtils'; // Import necessary functions from pdfUtils

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
        let fullText = ''; // Use fullText again
        // let pages: PageText[] = []; // Remove pages variable

        // --- Text Extraction (Revert to direct pdf-parse) ---
        const fileExtension = originalFilename.split('.').pop()?.toLowerCase() || '';

        if (fileExtension === 'pdf') {
            console.log(`[DocProcessor] Extracting text from PDF using pdf-parse...`);
            const pdfData = await pdf(fileBuffer);
            fullText = pdfData.text?.trim() || '';
            console.log(`[DocProcessor] pdf-parse extracted ${pdfData.numpages} pages. Text length: ${fullText.length}`);
        } else if (fileExtension === 'txt' || fileExtension === 'md') {
            fullText = fileBuffer.toString('utf-8');
            console.log(`[DocProcessor] Extracted text from TXT/MD file.`);
        } else {
            console.warn(`[DocProcessor] Unsupported file type for ${originalFilename}. Skipping text extraction.`);
            return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        if (!fullText) { // Check fullText directly
            console.warn(`[DocProcessor] No text content extracted from ${originalFilename}.`);
            return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        // --- Text Chunking (Revert to simple sliding window) ---
        const textChunks: string[] = [];
        for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
            const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);
            if (chunk.trim()) { // Avoid empty chunks
                textChunks.push(chunk);
            }
        }
        console.log(`[DocProcessor] Created ${textChunks.length} raw text chunks using sliding window.`);

        if (textChunks.length === 0) {
             console.warn(`[DocProcessor] Text chunking resulted in 0 chunks for ${originalFilename}.`);
             return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        // --- Generate Embeddings (Remains the same) ---
        console.log(`[DocProcessor] Generating embeddings for ${textChunks.length} chunks...`);
        const embeddings = await generateEmbeddings(textChunks);
        console.log(`[DocProcessor] Embeddings generated successfully.`);

        if (embeddings.length !== textChunks.length) {
             throw new Error(`Mismatch between chunk count (${textChunks.length}) and embedding count (${embeddings.length})`);
        }

        // Combine chunks with metadata (Revert to simpler structure without pageNumbers)
        const finalChunks: Chunk[] = textChunks.map((text) => ({
            text: text,
            // pageNumbers: undefined // Remove pageNumbers if reverting fully
        }));

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