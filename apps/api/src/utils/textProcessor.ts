/**
 * Splits text into chunks of approximately equal size.
 * @param text The text to split into chunks
 * @param maxChunkSize Maximum size of each chunk (default: 1000 characters)
 * @returns Array of text chunks
 */
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  // Remove extra whitespace and normalize line endings
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  
  if (normalizedText.length <= maxChunkSize) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = normalizedText.match(/[^.!?]+[.!?]+/g) || [normalizedText];

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChunkSize) {
      currentChunk += sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
} 