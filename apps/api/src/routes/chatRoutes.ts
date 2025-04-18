import express, { Request, Response, Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { protect, checkSession } from '../middleware/authMiddleware';
import { generateEmbeddings, getChatCompletion } from '../utils/openaiHelper';
import { ChatCompletionMessageParam as OpenAIChatCompletionMessageParam } from 'openai/resources/chat';
import { Chat, IChatMessage, IChat } from '../models/ChatModel';
import { queryVectors } from '../utils/pineconeService';

const router: Router = express.Router();

// Apply protect and checkSession middleware to all chat routes
router.use(protect, checkSession);

// System prompt template for chat completions - Updated for conciseness
const SYSTEM_PROMPT_TEMPLATE = `You are an AI assistant specializing in the provided documents. Your task is to answer the user's question accurately and concisely, based *exclusively* on the text within the 'Context' section below.

Instructions:
1. Read the user's question carefully.
2. Thoroughly analyze the provided 'Context' which contains relevant document excerpts.
3. Synthesize your answer using *only* the information found in the 'Context'. Do not use any prior knowledge or external information.
4. If the 'Context' contains the information needed to answer the question, provide the answer directly.
5. If the 'Context' does not contain the necessary information, state clearly: "I cannot answer this question based on the provided documents."
6. Be concise. Do not repeat the user's question or the context provided. Focus on providing the answer directly.
7. Do not make up information or speculate beyond the provided text.

Context:
------
\${context}
------`;


// POST /api/chat - Handle chat queries and persist history
router.post('/', async (req: Request, res: Response): Promise<void | Response> => {
    const { query, history = [], searchMode = 'system-kb', chatId } = req.body;
    const userId = req.user && ('_id' in req.user) ? req.user._id : req.user?.userId;

    console.log(`[Chat] Received query from user ${userId || 'UNKNOWN'}: "${query.substring(0,50)}..."`, { searchMode, chatId });

    if (!userId) {
        console.error('[Chat] Critical: userId (ObjectId) missing after protect middleware.');
        return res.status(401).json({ success: false, message: 'Authentication error: User ID could not be determined.' });
    }
    if (!query) {
        return res.status(400).json({ success: false, message: 'Query is required.' });
    }

    try {
        const sourceType = searchMode === 'user-docs' ? 'user' : 'system';
        console.log(`[Chat] Determined sourceType for filter: ${sourceType}`);

        // 1. Generate embedding
        console.log('[Chat] Generating embedding for query...');
        const queryEmbedding = await generateEmbeddings([query]);
        if (!queryEmbedding || queryEmbedding.length === 0 || queryEmbedding[0].length === 0) {
            throw new Error('Failed to generate query embedding.');
        }
        console.log('[Chat] Query embedding generated successfully.');

        // 2. Define filter for Pinecone query
        const topK = 5; // Number of chunks to retrieve
        let filter: Record<string, any> = { sourceType: sourceType }; // Base filter on sourceType
        
        if (sourceType === 'user') {
            filter.userId = userId.toString(); // Add userId filter ONLY for user documents
            console.log(`[Chat] Applying user-specific filter: ${JSON.stringify(filter)}`);
            } else {
            console.log(`[Chat] Applying system-only filter: ${JSON.stringify(filter)}`);
        }
        
        // 3. Query Pinecone
        console.log(`[Chat] Querying Pinecone with topK=${topK}, filter: ${JSON.stringify(filter)}`);
        const queryResults = await queryVectors(queryEmbedding[0], topK, filter);
        console.log(`[Chat] Pinecone query completed.`);

        // Extract context and sources from Pinecone results
        let context = '';
        const sources: any[] = []; 
        if (queryResults && queryResults.matches && queryResults.matches.length > 0) {
            console.log(`[Chat] Pinecone returned ${queryResults.matches.length} matches.`);
            context = queryResults.matches
                .map((match: any) => match.metadata?.text || '') 
                .join('\n\n---\n\n'); 

            // Store metadata for source referencing
            queryResults.matches.forEach((match: any) => {
                if (match.metadata) {
                    const source = {
                        id: match.id, 
                        score: match.score,
                        fileName: match.metadata.originalFileName || 'Unknown File',
                        documentId: match.metadata.documentId || null,
                        chunkIndex: typeof match.metadata.chunkIndex === 'number' ? match.metadata.chunkIndex : -1,
                        type: match.metadata.sourceType || sourceType // Use metadata sourceType if available, else fallback
                    };
                    if (source.documentId || (source.type === 'system' && source.fileName !== 'Unknown File')) {
                         sources.push(source);
                    }
                }
            });
            
            if (!context.trim()) {
                 console.warn("[Chat] Pinecone matches found, but no text content in metadata.");
            }
        } else {
            console.log('[Chat] No relevant document chunks found in Pinecone for the query.');
        }

        if (!context.trim()) {
            console.log('[Chat] No context found. Responding based on general knowledge (or returning specific message).');
            context = `No relevant context found in ${sourceType === 'user' ? 'user' : 'system'} documents.`; // Provide placeholder context
        }

        // === ADD LOGGING FOR RETRIEVED CONTEXT ===
        console.log(`[Chat RAG Debug] Found ${sources.length} context sources.`);
        console.log('[Chat RAG Debug] Context string start:', context.substring(0, 200) + (context.length > 200 ? '...' : '')); 

        // 4. Format the prompt for OpenAI (Using existing SYSTEM_PROMPT_TEMPLATE)
        const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('${context}', context);

        // 5. Build conversation history
        const messages: OpenAIChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            ...history
                .filter((msg: any) => msg.role && msg.content) // Basic validation
                .map((msg: any) => ({ role: msg.role, content: msg.content })), // Ensure correct format
            { role: 'user', content: query }
        ];
     
        console.log('[Chat] Preparing to call OpenAI with history length:', history.length);

        // === ADD LOGGING FOR FINAL PROMPT ===
        console.log('[Chat RAG Debug] Messages being sent to OpenAI:', JSON.stringify(messages, null, 2)); // Log the full messages array

        // 6. Call OpenAI API
        console.time('OpenAICallDuration');
        const completion = await getChatCompletion(messages);
        console.timeEnd('OpenAICallDuration');

        if (!completion?.choices?.[0]?.message?.content) {
            console.error('[Chat] Failed to get completion from OpenAI or received null/empty response.');
            throw new Error('Failed to get response from AI assistant.');
        }

        const answer = completion.choices[0].message.content.trim();
        console.log('[Chat] Received response from OpenAI.');

        // 7. Prepare response with DE-DUPLICATED sources
        const uniqueSourcesMap = new Map<string, { fileName: string; type: 'user' | 'system', documentId: string | null; }>();
        sources.forEach(source => {
            const key = source.documentId || source.fileName; // Use docId for user, filename for system as unique key
            if (!uniqueSourcesMap.has(key)) {
                uniqueSourcesMap.set(key, {
                    fileName: source.fileName, // Use originalFileName for display
                    type: source.type,
                    documentId: source.documentId // Keep documentId (might be null for system)
                });
            }
            // Note: Page number aggregation removed as Pinecone metadata doesn't easily support it per chunk
        });
        const finalSources = Array.from(uniqueSourcesMap.values());

        // --- Update Response Object structure to match IChatMessage/Frontend expectation (if needed) ---
        // Ensure the structure matches what IChatMessage expects for sources
        // Example: Assuming IChatMessage source needs { source: string, ... }
        const finalSourcesForResponse = finalSources.map(fs => ({
          documentId: fs.documentId,
          type: fs.type,
          fileName: fs.fileName, // Ensure this field name is consistent
          // Add pageNumbers if available/needed - Currently not available from this point
        }));

        const responseObject: any = {
            success: true,
            answer,
            sources: finalSourcesForResponse.slice(0, 5) // Limit unique sources, use adjusted structure
        };
        console.log('[Chat] Sending final response. Answer length:', answer.length, 'Sources count:', responseObject.sources.length);


        // --- Start Chat Persistence Logic ---
        if (!responseObject || !responseObject.answer) {
            console.error('[Chat Persistence] No answer generated, cannot persist chat message.');
            return res.status(500).json({ success: false, message: 'Failed to generate AI response, cannot save chat.' });
        }

        try {
            const userMessage: IChatMessage = {
                role: 'user',
                content: query,
                timestamp: new Date()
            };
            const assistantMessage: IChatMessage = {
                role: 'assistant',
                content: responseObject.answer,
                sources: finalSourcesForResponse,
                timestamp: new Date()
            };

            let chat: IChat | null = null;
            if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
                console.log(`[Chat Persistence] Attempting to find existing chat ${chatId} for user ${userId}`);
                chat = await Chat.findOne({ _id: chatId, userId: userId });
            }

            if (chat) {
                console.log(`[Chat Persistence] Found existing chat ${chatId}. Appending messages.`);
                chat.messages.push(userMessage, assistantMessage);
                chat.updatedAt = new Date();
            } else {
                console.log(`[Chat Persistence] No existing chat found or ID invalid/missing. Creating new chat for user ${userId}`);
                const chatTitle = query.substring(0, 40) + (query.length > 40 ? '...' : '');
                chat = new Chat({
                    userId: new mongoose.Types.ObjectId(userId.toString()),
                    title: chatTitle,
                    messages: [userMessage, assistantMessage]
                });
                console.log(`[Chat Persistence] New chat object created with ID ${chat._id}`);
            }

            await chat.save();
            console.log(`[Chat Persistence] Chat ${chat._id} saved successfully.`);

            // Include the chatId in the response, checking if chat and _id exist
            if (chat?._id) {
              responseObject.chatId = chat._id.toString();
            } else {
              console.warn('[Chat Persistence] Chat or chat._id was unexpectedly undefined after save.');
            }

        } catch (dbError: any) {
            console.error('[Chat Persistence] Error saving chat to database:', dbError);
            // Add flag to the response (responseObject is already 'any')
            responseObject.persistenceError = 'Failed to save chat history.';
        }
        // --- End Chat Persistence Logic ---

        return res.status(200).json(responseObject);

    } catch (error: any) {
        console.error('[Chat] Error processing chat query:', error);
        return res.status(500).json({
            success: false,
            message: 'Error processing chat query.',
            error: error.message || String(error)
        });
    }
});

// GET /api/chats - Fetch list of chats for the logged-in user
router.get('/chats', async (req: Request, res: Response): Promise<void | Response> => {
    const userId = req.user && ('_id' in req.user) ? req.user._id : req.user?.userId;

    if (!userId) {
        // Should be caught by protect middleware, but double-check
        return res.status(401).json({ success: false, message: 'Authentication error: User ID not found.' });
    }

    try {
        console.log(`[Chat List] Fetching chats for user: ${userId}`);
        // Find using the determined ID
        const chats = await Chat.find({ userId: userId })
            .select('_id chatName updatedAt createdAt') // Select specific fields
            .sort({ updatedAt: -1 }); // Sort by most recently updated

        console.log(`[Chat List] Found ${chats.length} chats for user: ${userId}`);
        return res.status(200).json({ success: true, chats });

    } catch (error) {
        console.error('[Chat List] Error fetching chat list:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching chat list.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// GET /api/chats/:chatId - Fetch a specific chat by its ID
router.get('/chats/:chatId', async (req: Request, res: Response): Promise<void | Response> => {
    const userId = req.user && ('_id' in req.user) ? req.user._id : req.user?.userId;
    const { chatId } = req.params;

    if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication error: User ID not found.' });
    }

    // Validate chatId format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
        console.log(`[Chat Detail] Invalid chatId format received: ${chatId}`);
        return res.status(400).json({ success: false, message: 'Invalid chat ID format.' });
    }

    try {
        console.log(`[Chat Detail] Fetching chat ${chatId} for user: ${userId}`);
        // Find using the determined ID
        const chat = await Chat.findOne({ _id: chatId, userId: userId }); // Ensure chat belongs to the user

        if (!chat) {
            console.log(`[Chat Detail] Chat ${chatId} not found or does not belong to user ${userId}.`);
            return res.status(404).json({ success: false, message: 'Chat not found or access denied.' });
        }

        console.log(`[Chat Detail] Successfully fetched chat ${chatId}. Message count: ${chat.messages.length}`);
        return res.status(200).json({ success: true, chat });

    } catch (error) {
        console.error(`[Chat Detail] Error fetching chat ${chatId}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching chat details.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// DELETE /api/chat/chats/:chatId - Delete a specific chat
router.delete('/chats/:chatId', async (req: Request, res: Response): Promise<void | Response> => {
    const userId = req.user && ('_id' in req.user) ? req.user._id : req.user?.userId;
    const { chatId } = req.params;

    if (!userId) {
        // Should be caught by protect middleware, but belts and suspenders
        return res.status(401).json({ success: false, message: 'Authentication error: User ID not found.' });
    }

    // Validate chatId format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
        console.log(`[Chat Delete] Invalid chatId format received: ${chatId}`);
        return res.status(400).json({ success: false, message: 'Invalid chat ID format.' });
    }

    console.log(`[Chat Delete] Attempting to delete chat ${chatId} for user ${userId}`);

    try {
        // Delete using the determined ID
        const result = await Chat.deleteOne({ _id: chatId, userId: userId });

        if (result.deletedCount === 1) {
            console.log(`[Chat Delete] Successfully deleted chat ${chatId} for user ${userId}`);
            return res.status(200).json({ success: true, message: 'Chat deleted successfully.' });
        } else {
            // This means no document matched the _id and userId combination
            console.log(`[Chat Delete] Chat ${chatId} not found or does not belong to user ${userId}.`);
            return res.status(404).json({ success: false, message: 'Chat not found or access denied.' });
        }
    } catch (error) {
        console.error(`[Chat Delete] Error deleting chat ${chatId} for user ${userId}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting chat.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router; 