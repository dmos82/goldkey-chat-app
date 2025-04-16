import 'dotenv/config';
import { generateEmbedding, generateEmbeddings, getChatCompletion } from './utils/openaiHelper';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

async function testOpenAI() {
  try {
    console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Key exists (hidden for security)' : 'Missing key');
    
    // Test single embedding
    console.log('\n--- Testing Single Embedding Generation ---');
    const testText = 'This is a test text for embedding generation.';
    console.log(`Input text: "${testText}"`);
    
    const embedding = await generateEmbedding(testText);
    console.log(`Embedding generated successfully with ${embedding.length} dimensions.`);
    console.log('First 5 values:', embedding.slice(0, 5));
    
    // Test batch embeddings
    console.log('\n--- Testing Batch Embedding Generation ---');
    const batchTexts = [
      'First test text for batch embedding.',
      'Second test text for batch embedding.',
      'Third test text for batch embedding.'
    ];
    console.log(`Input: ${batchTexts.length} texts for batch embedding.`);
    
    const batchEmbeddings = await generateEmbeddings(batchTexts);
    console.log(`Batch embeddings generated successfully: ${batchEmbeddings.length} embeddings.`);
    console.log(`Each embedding has ${batchEmbeddings[0].length} dimensions.`);
    
    // Test chat completion
    console.log('\n--- Testing Chat Completion ---');
    const prompt: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant.'
      },
      {
        role: 'user',
        content: 'Hello! How are you?'
      }
    ];
    console.log(`Input prompt: "${prompt.map(p => p.content).join('\n')}"`);
    
    const completion = await getChatCompletion(prompt);
    console.log('Chat completion result:');
    console.log(completion);
    
    console.log('\n✅ All OpenAI functionality tests passed!');
  } catch (error) {
    console.error('\n❌ OpenAI functionality test failed:');
    console.error(error);
  }
}

// Run the tests
testOpenAI().catch(console.error); 