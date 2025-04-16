import fs from 'fs/promises';
import pdf from 'pdf-parse';
import { generateEmbeddings } from './openaiHelper'; // Assuming helper exists and handles embeddings

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
        let fullText = '';
        let pageChunks: { text: string; pageNum: number }[] = [];

        // --- Text Extraction (Example for PDF) ---
        // TODO: Add support for other types like TXT, MD
        if (originalFilename.toLowerCase().endsWith('.pdf')) {
            const pdfData = await pdf(fileBuffer);
            fullText = pdfData.text;
            // Simple page tracking (adjust if more granular chunk-to-page mapping is needed)
            if (pdfData.numpages > 0) {
                // Basic approach: iterate through pages if needed, pdf-parse gives text per page
                // For simplicity here, we'll just use the full text but acknowledge page count
                console.log(`[DocProcessor] Extracted ${pdfData.numpages} pages from PDF.`);
            }
        } else if (originalFilename.toLowerCase().endsWith('.txt') || originalFilename.toLowerCase().endsWith('.md')) {
            fullText = fileBuffer.toString('utf-8');
            console.log(`[DocProcessor] Extracted text from TXT/MD file.`);
        } else {
            console.warn(`[DocProcessor] Unsupported file type for ${originalFilename}. Skipping text extraction.`);
            return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        if (!fullText.trim()) {
            console.warn(`[DocProcessor] No text content extracted from ${originalFilename}.`);
            return { chunks: [], embeddings: [], totalChunks: 0 };
        }

        // --- Text Chunking (Simple Sliding Window) ---
        const textChunks: string[] = [];
        for (let i = 0; i < fullText.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
            const chunk = fullText.substring(i, i + MAX_CHUNK_SIZE);
            if (chunk.trim()) { // Avoid empty chunks
                textChunks.push(chunk);
            }
        }
        console.log(`[DocProcessor] Created ${textChunks.length} raw text chunks.`);

        if (textChunks.length === 0) {
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

        // Combine chunks with metadata (basic example)
        const finalChunks: Chunk[] = textChunks.map((text) => ({
            text: text,
            // pageNumbers: undefined // TODO: Implement more granular page tracking if needed
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