import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam, ChatCompletion } from 'openai/resources/chat/completions';

// Check if API key is available
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not defined in environment variables');
}

// --- Chat Model Configuration ---
const DEFAULT_CHAT_MODEL = 'gpt-3.5-turbo-0125';
const configuredChatModel = process.env.OPENAI_CHAT_MODEL || DEFAULT_CHAT_MODEL;

if (!process.env.OPENAI_CHAT_MODEL) {
    console.warn(`[Config] OPENAI_CHAT_MODEL not set. Defaulting to ${DEFAULT_CHAT_MODEL}`);
} else {
    console.log(`[Config] Using OpenAI Chat Model: ${configuredChatModel}`); // Log configured model on load
}
// -----------------------------

// --- Pricing Constants (per token) ---
const MODEL_PRICING: { [key: string]: { input: number; output: number } } = {
    'gpt-4.1-mini-2025-04-14': { input: 0.0000004, output: 0.0000016 }, 
    'gpt-3.5-turbo-0125': { input: 0.0000005, output: 0.0000015 },
    // Add other models as needed, e.g., might need base gpt-3.5-turbo if API returns that
    'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 }, 
};
// -----------------------------------

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
    console.log(`[OpenAIHelper] Requesting chat completion with model: ${configuredChatModel}`);
    const startTime = Date.now(); // Start timer
    const completion = await openai.chat.completions.create({
      model: configuredChatModel,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    });
    const duration = Date.now() - startTime; // End timer

    // --- Token Usage and Cost Logging ---
    if (completion?.usage) {
        const usage = completion.usage;
        const modelUsed = completion.model; // Get the exact model used from response
        const pricing = MODEL_PRICING[modelUsed] || MODEL_PRICING[DEFAULT_CHAT_MODEL]; // Fallback pricing
        
        if (!MODEL_PRICING[modelUsed]) {
            console.warn(`[Usage Log] Pricing not found for model: ${modelUsed}. Using default pricing for cost estimation.`);
        }

        const inputCost = usage.prompt_tokens * pricing.input;
        const outputCost = usage.completion_tokens * pricing.output;
        const totalCost = inputCost + outputCost;

        console.log(
            `[Usage Log] Model: ${modelUsed} | Duration: ${duration}ms | Prompt: ${usage.prompt_tokens} | Completion: ${usage.completion_tokens} | Total: ${usage.total_tokens} tokens | Est. Cost: $${totalCost.toFixed(6)}`
        );
    } else {
        console.warn('[Usage Log] OpenAI response did not contain usage data.');
    }
    // --- End Logging ---

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
    console.log(`[OpenAIHelper] Requesting (WithMessages) chat completion with model: ${configuredChatModel}`); // Log model used per request
    const response = await openai.chat.completions.create({
      model: configuredChatModel, // Use the configured model
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