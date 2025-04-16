// apps/api/src/utils/inMemoryStore.ts

/**
 * Represents a chunk of a document with its metadata and embedding.
 */
export interface InMemoryDocumentChunk {
  metadata: {
    fileName: string;
    chunkId: string; // Unique identifier for the chunk (e.g., `${fileName}-${chunkIndex}`)
    // Add other relevant metadata like sourceId if available
  };
  pageContent: string; // Renamed from 'text' for clarity
  embedding: number[];
}

/**
 * Simple cosine similarity function.
 * Handles potential errors and edge cases.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    console.error('Cosine similarity error: Invalid or mismatched vectors.', { lenA: vecA?.length, lenB: vecB?.length });
    return 0;
  }
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    const valA = vecA[i];
    const valB = vecB[i];
    // Check for invalid numbers early
    if (typeof valA !== 'number' || typeof valB !== 'number' || isNaN(valA) || isNaN(valB)) {
      console.error('Invalid value in vector during cosine similarity.', { index: i, valA, valB });
      return 0;
    }
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const magnitudeA = Math.sqrt(normA);
  const magnitudeB = Math.sqrt(normB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);
  // Clamp the value to [-1, 1]
  return Math.max(-1, Math.min(1, similarity));
}

// --- In-Memory Store Logic ---

// Internal storage array for document chunks
const documentStore: InMemoryDocumentChunk[] = [];

/**
 * Adds a single document chunk to the in-memory store.
 * Includes validation.
 */
export function addDocumentChunk(chunk: InMemoryDocumentChunk): void {
  // Basic validation
  if (!chunk?.metadata?.chunkId || !chunk.pageContent || !chunk.embedding?.length) {
    console.error('[InMemoryStore] Attempted to add invalid chunk:', chunk);
    return;
  }
  if (chunk.embedding.some(isNaN)) {
     console.error(`[InMemoryStore] Chunk ${chunk.metadata.chunkId} embedding contains NaN values.`);
     return;
  }

  // Optional: Check for duplicates based on chunkId before pushing
  const exists = documentStore.some(doc => doc.metadata.chunkId === chunk.metadata.chunkId);
  if (exists) {
      console.warn(`[InMemoryStore] Chunk ${chunk.metadata.chunkId} already exists. Skipping.`);
      return;
  }

  documentStore.push(chunk);
  // console.log(`[InMemoryStore] Added chunk ${chunk.metadata.chunkId}. Total chunks: ${documentStore.length}`); // Keep less verbose
}

/**
 * Performs similarity search on the in-memory store.
 * Returns top K chunks sorted by similarity score.
 */
export function similaritySearch(queryEmbedding: number[], topK: number): InMemoryDocumentChunk[] {
  console.log(`[InMemoryStore] similaritySearch started. Comparing against ${documentStore.length} chunks.`);
  if (documentStore.length === 0 || topK <= 0) {
    return [];
  }
  if (!queryEmbedding || queryEmbedding.length === 0 || queryEmbedding.some(isNaN)) {
    console.error('[InMemoryStore] Invalid query embedding for similarity search.');
    return [];
  }

  const scoredChunks = documentStore
    .map(chunk => {
      if (!chunk.embedding || chunk.embedding.length !== queryEmbedding.length || chunk.embedding.some(isNaN)) {
        console.warn(`[InMemoryStore] Skipping chunk ${chunk.metadata.chunkId} due to invalid/mismatched embedding.`);
        return { chunk, score: -Infinity };
      }
      return {
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      };
    })
    .filter(item => isFinite(item.score)); // Filter out items with -Infinity score

  scoredChunks.sort((a, b) => b.score - a.score); // Sort descending by score

  const topResults = scoredChunks.slice(0, topK).map(item => item.chunk); // Get only the chunks
  console.log(`[InMemoryStore] similaritySearch finished. Returning ${topResults.length} results.`);
  return topResults;
}

/**
 * Clears all documents from the store.
 */
export function clearStore(): void {
  documentStore.length = 0;
  console.log('[InMemoryStore] Store cleared.');
}

// Log initialization
console.log('[InMemoryStore] Utility initialized.'); 