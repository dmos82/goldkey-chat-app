import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam, ChatCompletion } from 'openai/resources/chat/completions';

// Check if API key is available
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not defined in environment variables');
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey,
});

/**
 * Generates an embedding vector for the provided text
 * @param text - The text to generate an embedding for
 * @returns Promise resolving to an array of numbers (embedding vector)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    // Ensure embedding exists and return it
     if (!response?.data?.[0]?.embedding) {
       throw new Error('Invalid embedding response format');
     }
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generates embedding vectors for multiple texts in batch
 * @param texts - Array of texts to generate embeddings for
 * @returns Promise resolving to a 2D array of number arrays (embedding vectors)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    if (!texts || texts.length === 0) {
      return [];
    }
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });
    
    // Validate and extract all embeddings
    if (!response?.data || response.data.length !== texts.length) {
      throw new Error('Invalid embedding response format or count mismatch');
    }
    
    // Sort by index to ensure correct order
    const sortedEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);
      
    return sortedEmbeddings;
  } catch (error) {
    console.error('Error generating batch embeddings:', error);
    throw new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets a chat completion from OpenAI
 * @param messages - Array of chat messages in OpenAI format
 * @returns Promise resolving to the full ChatCompletion object or null
 */
export async function getChatCompletion(messages: ChatCompletionMessageParam[]): Promise<ChatCompletion | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    // Check if choices exist
    if (!completion || !completion.choices || completion.choices.length === 0) {
      console.warn('[OpenAIHelper] No choices returned from OpenAI.');
      return null;
    }

    // Return the full completion object
    return completion;
    
  } catch (error) {
    console.error('Error in getChatCompletion:', error);
    // Return null or re-throw depending on desired error handling
    return null; // Returning null for now, let the caller handle it
  }
}

/**
 * Gets a chat completion from OpenAI using custom messages
 * @param messages - Array of chat messages in OpenAI format
 * @returns Promise resolving to the completion text
 */
export async function getChatCompletionWithMessages(messages: ChatCompletionMessageParam[]): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });
    
    // Ensure content exists before returning
    return response.choices[0].message.content || "";
  } catch (error) {
    console.error('Error getting chat completion with messages:', error);
    throw new Error(`Failed to get chat completion: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Export the openai instance for potential direct use if needed elsewhere
export default openai; 