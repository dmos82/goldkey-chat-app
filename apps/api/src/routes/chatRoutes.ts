import express, { Request, Response, Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { protect, checkSession } from '../middleware/authMiddleware';
import { generateEmbeddings, getChatCompletion } from '../utils/openaiHelper';
import { ChatCompletionMessageParam as OpenAIChatCompletionMessageParam } from 'openai/resources/chat';
import { Chat, IChatMessage, IChat } from '../models/ChatModel';
import { queryVectors } from '../utils/pineconeService';
import { UserDocument } from '../models/UserDocument'; // Import UserDocument model
import User from '../models/UserModel'; // Corrected Import: Use the default export

const router: Router = express.Router();

// Apply protect and checkSession middleware to all chat routes
router.use(protect, checkSession);

// System prompt template for chat completions - REFINED
const SYSTEM_PROMPT_TEMPLATE = 
`You are an AI assistant designed to answer questions based **only** on the provided context.

**Instructions:**
1.  Carefully analyze the user's question.
2.  Thoroughly review the provided 'Context' below. This context contains excerpts from relevant documents and may include a 'Sources' section listing document filenames.
3.  Formulate your answer **using exclusively the information found in the 'Context'**. 
4.  **CRITICAL:** Do **NOT** use any prior knowledge, external information, or make assumptions beyond the provided text.
5.  If the Context contains the answer, provide it directly and concisely.
6.  If the Context **does not** contain the necessary information to directly answer the question, **do not state "I cannot answer"**. Instead, politely ask the user to provide more details or be more specific about their query regarding the topic. (e.g., "The documents mention [topic], could you please specify what you'd like to know about it?")
7.  **Listing Sources:** If the user asks to list documents or sources related to their query, list the filenames provided in the 'Sources:' part of the Context. Only list filenames explicitly mentioned in the Context section. Do not infer or list other documents.
8.  Be concise. Do not repeat the user's question unless necessary for clarification. Focus on providing the answer or stating inability based on context.

**Context:**
---
\\\${context}
---
`
// Note: The user's question will be appended by the calling function.


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
        const originalQuery = query; // Preserve original query for logging/history
        const queryForEmbedding = originalQuery.toLowerCase(); // Lowercase for embedding search
        console.log(`[Chat RAG Debug] Original query: "${originalQuery}"`);
        console.log(`[Chat RAG Debug] Query used for embedding: "${queryForEmbedding}"`);

        console.log('[Chat] Generating embedding for lowercased query...');
        // Use the lowercased query for embedding generation
        const queryEmbedding = await generateEmbeddings([queryForEmbedding]);
        if (!queryEmbedding || queryEmbedding.length === 0 || queryEmbedding[0].length === 0) {
            throw new Error('Failed to generate query embedding.');
        }
        console.log('[Chat] Query embedding generated successfully.');

        // --- START HYBRID SEARCH --- 
        
        // 2a. Keyword Search (MongoDB)
        const KEYWORD_SEARCH_LIMIT = 5; // Max documents to fetch via keyword search
        let keywordDocIds: string[] = [];
        try {
            console.log(`[Chat Hybrid] Performing keyword search for: "${queryForEmbedding}"`);
            const keywordFilter: mongoose.FilterQuery<any> = {
                sourceType: sourceType,
                originalFileName: { $regex: queryForEmbedding, $options: 'i' } // Case-insensitive regex search
                // Consider adding $text search if text index is properly configured: { $text: { $search: queryForEmbedding } }
            };
            if (sourceType === 'user') {
                keywordFilter.userId = userId;
            }
            const keywordDocs = await UserDocument.find(keywordFilter)
                .select('_id originalFileName') // Select only necessary fields
                .limit(KEYWORD_SEARCH_LIMIT)
                .lean(); // Use lean for performance

            keywordDocIds = keywordDocs.map(doc => doc._id.toString());
            console.log(`[Chat Hybrid] Keyword search found ${keywordDocs.length} potential documents:`, keywordDocs.map(d => d.originalFileName));
        } catch (mongoError: any) {
            console.error('[Chat Hybrid] Error during MongoDB keyword search:', mongoError);
            // Non-fatal, continue with semantic search
        }
        
        // 2b. Semantic Search (Pinecone)
        const SEMANTIC_SEARCH_TOP_K = 15; // Fetch slightly more results for potential boosting
        let pineconeFilter: Record<string, any> = { sourceType: sourceType }; 
        if (sourceType === 'user') {
            pineconeFilter.userId = userId.toString();
            console.log(`[Chat] Applying user-specific filter for Pinecone: ${JSON.stringify(pineconeFilter)}`);
        } else {
            console.log(`[Chat] Applying system-only filter for Pinecone: ${JSON.stringify(pineconeFilter)}`);
        }
        
        console.log(`[Chat Hybrid] Querying Pinecone with topK=${SEMANTIC_SEARCH_TOP_K}, filter: ${JSON.stringify(pineconeFilter)}`);
        const queryResults = await queryVectors(queryEmbedding[0], SEMANTIC_SEARCH_TOP_K, pineconeFilter);
        console.log(`[Chat Hybrid] Pinecone query completed. Found ${queryResults?.matches?.length ?? 0} semantic matches initially.`);

        // 3. Combine and Rank Results
        const KWD_BOOST_FACTOR = 1.5; // Multiplier for scores of keyword-matched results
        const FINAL_CONTEXT_LIMIT = 7; // Max sources/chunks for final context
        
        let combinedSources: any[] = [];
        if (queryResults && queryResults.matches && queryResults.matches.length > 0) {
            combinedSources = queryResults.matches.map((match: any) => {
                const docId = match.metadata?.documentId;
                const isKeywordMatch = docId && keywordDocIds.includes(docId);
                const boostedScore = isKeywordMatch ? (match.score * KWD_BOOST_FACTOR) : match.score;

                return {
                    id: match.id,
                    score: match.score, // Original semantic score
                    boostedScore: boostedScore, // Score after potential keyword boost
                    isKeywordMatch: isKeywordMatch,
                    text: match.metadata?.text || '',
                    fileName: match.metadata?.originalFileName || 'Unknown File',
                    documentId: docId || null,
                    chunkIndex: typeof match.metadata?.chunkIndex === 'number' ? match.metadata.chunkIndex : -1,
                    type: match.metadata?.sourceType || sourceType
                };
            });

            // Sort by boosted score (descending)
            combinedSources.sort((a, b) => b.boostedScore - a.boostedScore);
            console.log(`[Chat Hybrid] Sorted combined sources by boosted score. Top score: ${combinedSources[0]?.boostedScore}, Keyword match: ${combinedSources[0]?.isKeywordMatch}`);

        } else {
            console.log('[Chat Hybrid] No semantic matches found.');
            // If keyword search found results, we might consider fetching their content here
            // For simplicity now, we proceed without context if semantic search fails
        }
        
        // --- END HYBRID SEARCH --- 

        // 4. Build Context and Final Sources from Combined Results (Prioritize Keyword Matches)
        let context = '';
        const finalSourcesForLlm: any[] = [];
        const addedDocIds = new Set<string>(); // Track added document IDs

        console.log(`[Chat RAG] Building final context. Prioritizing ${keywordDocIds.length} keyword matches...`);

        // First pass: Add top chunk from each keyword-matched document
        const keywordMatchedSourcesToAdd = new Map<string, any>(); // Map to store best chunk per keyword doc
        for (const source of combinedSources) {
            if (source.documentId && keywordDocIds.includes(source.documentId)) {
                if (!keywordMatchedSourcesToAdd.has(source.documentId)) {
                     // Store the first (highest boosted score) chunk encountered for this keyword doc
                    keywordMatchedSourcesToAdd.set(source.documentId, source);
                }
            }
        }

        // Add prioritized keyword matches to final list (up to limit)
        for (const source of Array.from(keywordMatchedSourcesToAdd.values())) {
            if (finalSourcesForLlm.length >= FINAL_CONTEXT_LIMIT) break;
            if (source.text && source.documentId && !addedDocIds.has(source.documentId)) { 
                finalSourcesForLlm.push(source);
                addedDocIds.add(source.documentId);
                console.log(`[Chat RAG Priority] Added Keyword Match: ${source.fileName} (DocID: ${source.documentId}, Chunk: ${source.chunkIndex}, Score: ${source.boostedScore.toFixed(4)})`);
            } else if (!source.text) {
                console.warn(`[Chat RAG Priority] Keyword matched source ${source.fileName} has no text, skipping.`);
            }
        }

        console.log(`[Chat RAG] Added ${finalSourcesForLlm.length} sources from keyword matches. Filling remaining slots...`);

        // Second pass: Fill remaining slots with best non-keyword-matched semantic results
        for (const source of combinedSources) {
            if (finalSourcesForLlm.length >= FINAL_CONTEXT_LIMIT) {
                console.log(`[Chat RAG] Reached final context limit (${FINAL_CONTEXT_LIMIT}).`);
                break;
            }
            // Add if it has text, has a documentId, and hasn't been added already
            if (source.text && source.documentId && !addedDocIds.has(source.documentId)) {
                finalSourcesForLlm.push(source);
                addedDocIds.add(source.documentId);
                console.log(`[Chat RAG Fill] Added Semantic Match: ${source.fileName} (DocID: ${source.documentId}, Chunk: ${source.chunkIndex}, Score: ${source.boostedScore.toFixed(4)}, Keyword: ${source.isKeywordMatch})`);
            } else if (!source.documentId && source.fileName !== 'Unknown File' && !addedDocIds.has(source.fileName)) {
                 // Handle legacy system docs (if necessary, though less likely now)
                 if (source.text) {
                     finalSourcesForLlm.push(source);
                     addedDocIds.add(source.fileName); // Use filename as key
                     console.log(`[Chat RAG Fill] Added Legacy Semantic Match: ${source.fileName} (Chunk: ${source.chunkIndex}, Score: ${source.boostedScore.toFixed(4)}, Keyword: ${source.isKeywordMatch})`);
                 } else {
                      console.warn(`[Chat RAG Fill] Legacy Source ${source.fileName} has no text content, skipping.`);
                 }
            }
        }
        
        // Build context string from the final selected sources
        context = finalSourcesForLlm.map(s => s.text).join('\n\n---\n\n');

        if (!context.trim()) {
            console.log('[Chat RAG] No relevant context found after processing hybrid results.');
            context = `No relevant context found in ${sourceType === 'user' ? 'user' : 'system'} documents for the query "${originalQuery}".`; 
        }

        // 5. Format prompt for OpenAI (use the re-assembled context)
        const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('${context}', context);

        // 6. Build conversation history (unchanged)
        const messages: OpenAIChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            ...history
                .filter((msg: any) => msg.role && msg.content) 
                .map((msg: any) => ({ role: msg.role, content: msg.content })), 
            { role: 'user', content: query } // Still use original query for user message
        ];
     
        console.log('[Chat] Preparing to call OpenAI with history length:', history.length);

        // --- RAG DEBUG LOGGING (Updated to show hybrid info) --- 
        console.log(`\n--- START RAG DEBUG LOG (Hybrid) ---`);
        console.log(`[RAG DEBUG] User Query (Original): ${originalQuery}`);
        console.log(`[RAG DEBUG] User Query (Used for Embedding/Keyword): ${queryForEmbedding}`);
        console.log(`[RAG DEBUG] Keyword Matched Doc IDs: ${JSON.stringify(keywordDocIds)}`);
        console.log(`[RAG DEBUG] Final Ranked Sources Sent for Context: ${JSON.stringify(finalSourcesForLlm.map(s => ({ fn: s.fileName, docId: s.documentId, score: s.boostedScore, kw: s.isKeywordMatch })), null, 2)}`);
        console.log(`[RAG DEBUG] Context Text Sent to LLM:\n---\n${context}\n---`);
        console.log(`--- END RAG DEBUG LOG (Hybrid) ---\n`);
        // --- END RAG DEBUG LOGGING ---

        // 7. Call OpenAI API (unchanged)
        console.time('OpenAICallDuration');
        const completion = await getChatCompletion(messages);
        console.timeEnd('OpenAICallDuration');

        // --- Start Token Usage & Cost Calculation ---
        let requestCost = 0;
        let usageData = null;
        const GPT41_MINI_PRICE_PER_PROMPT_TOKEN = 0.40 / 1000000;
        const GPT41_MINI_PRICE_PER_COMPLETION_TOKEN = 1.60 / 1000000;

        if (completion && completion.usage) {
            usageData = completion.usage; // Store the usage object
            const promptTokens = completion.usage.prompt_tokens || 0;
            const completionTokens = completion.usage.completion_tokens || 0;

            // Calculate cost using specified GPT-4.1 Mini prices
            requestCost = (promptTokens * GPT41_MINI_PRICE_PER_PROMPT_TOKEN) + 
                          (completionTokens * GPT41_MINI_PRICE_PER_COMPLETION_TOKEN);

            console.log(`[Chat] OpenAI usage: Prompt Tokens: ${promptTokens}, Completion Tokens: ${completionTokens}, Total Tokens: ${usageData.total_tokens}, Calculated Cost: $${requestCost.toFixed(8)}`);

            // --- BEGIN USAGE TRACKING UPDATE --- 
            if (userId && promptTokens >= 0 && completionTokens >= 0) { // Only track if we have user and valid usage
                try {
                    const now = new Date();
                    const currentMonthMarker = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // Format: YYYY-MM

                    // Fetch user with specific fields needed for usage update
                    const user = await User.findById(userId).select('+usageMonthMarker +currentMonthPromptTokens +currentMonthCompletionTokens +currentMonthCost');
                    
                    if (user) {
                        let updateOperation = {};
                        
                        if (user.usageMonthMarker === currentMonthMarker) {
                            // Increment existing month's usage
                            updateOperation = {
                                $inc: {
                                    currentMonthPromptTokens: promptTokens,
                                    currentMonthCompletionTokens: completionTokens,
                                    currentMonthCost: requestCost,
                                }
                            };
                            console.log(`[Usage Tracking] Incrementing usage for user ${userId}, month ${currentMonthMarker}`);
                        } else {
                            // Reset usage for the new month
                            updateOperation = {
                                $set: {
                                    usageMonthMarker: currentMonthMarker,
                                    currentMonthPromptTokens: promptTokens,
                                    currentMonthCompletionTokens: completionTokens,
                                    currentMonthCost: requestCost,
                                }
                            };
                            console.log(`[Usage Tracking] Resetting usage for user ${userId}, new month ${currentMonthMarker}`);
                        }
                        
                        await User.findByIdAndUpdate(userId, updateOperation);
                        console.log(`[Usage Tracking] Successfully updated usage stats for user ${userId}`);

                    } else {
                        console.error(`[Usage Tracking] Could not find user ${userId} to update usage stats.`);
                    }
                } catch (usageUpdateError: any) {
                    console.error(`[Usage Tracking] Failed to update usage stats for user ${userId}:`, usageUpdateError);
                    // Non-fatal: Do not prevent chat response from being sent
                }
            } else {
                if (!userId) console.warn('[Usage Tracking] Cannot update usage stats: userId is missing.');
                if (!(promptTokens >= 0 && completionTokens >= 0)) console.warn('[Usage Tracking] Cannot update usage stats: Invalid token counts.', {promptTokens, completionTokens});
            }
            // --- END USAGE TRACKING UPDATE ---

        } else {
            console.warn('[Chat] OpenAI completion response did not contain usage data.');
        }
        // --- End Token Usage & Cost Calculation ---

        if (!completion?.choices?.[0]?.message?.content) {
            console.error('[Chat] Failed to get completion from OpenAI or received null/empty response.');
            throw new Error('Failed to get response from AI assistant.');
        }

        const answer = completion.choices[0].message.content.trim();
        console.log('[Chat] Received response from OpenAI.');

        // 8. Prepare response with DE-DUPLICATED sources from final Llm list
        // Use finalSourcesForLlm directly as it's already deduplicated by documentId
        const finalSourcesForResponse = finalSourcesForLlm.map(fs => ({
          documentId: fs.documentId,
          type: fs.type,
          fileName: fs.fileName, // Ensure this field name is consistent
          score: fs.boostedScore, // Include score for potential UI display
          keywordMatch: fs.isKeywordMatch // Include flag
        }));

        const responseObject: any = {
            success: true,
            answer,
            sources: finalSourcesForResponse // Use the ranked & deduplicated sources
        };

        // Add usage and cost to the response object
        if (usageData) {
            responseObject.usage = usageData;
        }
        responseObject.cost = requestCost; // Add cost (will be 0 if usage was missing)

        console.log('[Chat] Sending final response. Answer length:', answer.length, 'Sources count:', responseObject.sources.length, 'Usage:', usageData !== null, 'Cost:', requestCost);
        console.log('[Chat] Final Response Object:', responseObject); // Add temporary log


        // --- Start Chat Persistence Logic ---
        if (!responseObject || !responseObject.answer) {
            console.error('[Chat Persistence] No answer generated, cannot persist chat message.');
            return res.status(500).json({ success: false, message: 'Failed to generate AI response, cannot save chat.' });
        }

        try {
            // Use the ORIGINAL query for chat history persistence
            const userMessage: IChatMessage = {
                role: 'user',
                content: originalQuery,
                timestamp: new Date()
            };
            const assistantMessage: IChatMessage = {
                role: 'assistant',
                content: responseObject.answer,
                sources: finalSourcesForResponse.map(s => ({ // Map to expected IChatMessage source format
                    documentId: s.documentId,
                    fileName: s.fileName,
                    type: s.type
                    // Add score/keywordMatch here if IChatMessage schema supports it
                 })),
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
                
                // --- Generate Chat Title --- 
                const MAX_TITLE_LENGTH = 40;
                let generatedChatName = originalQuery.substring(0, MAX_TITLE_LENGTH);
                if (originalQuery.length > MAX_TITLE_LENGTH) {
                    generatedChatName += "...";
                }
                if (!generatedChatName.trim()) { // Handle empty/whitespace query
                    generatedChatName = "Chat Session"; // More descriptive than just "Chat"
                }
                // --------------------------

                chat = new Chat({
                    userId: new mongoose.Types.ObjectId(userId.toString()),
                    chatName: generatedChatName.trim(), // Use generated title
                    messages: [userMessage, assistantMessage]
                });
                console.log(`[Chat Persistence] New chat object created with ID ${chat._id} and Title: "${generatedChatName.trim()}"`);
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

// --- NEW ROUTE: DELETE /api/chat/all --- 
router.delete('/all', async (req: Request, res: Response): Promise<void | Response> => {
    const userId = req.user?._id;
    const username = req.user?.username;

    if (!userId) {
        // Should be caught by protect middleware, but safety check
        console.error('[Chat Delete All] User ID not found after protect middleware.');
        return res.status(401).json({ success: false, message: 'Authentication error: User ID not found.' });
    }

    console.log(`[Chat Delete All] Request received for user: ${username} (ID: ${userId})`);

    try {
        const result = await Chat.deleteMany({ userId: userId });
        const deletedCount = result.deletedCount || 0;
        console.log(`[Chat Delete All] Deleted ${deletedCount} chats for user ${username} (ID: ${userId}).`);
        
        // Send 200 OK with success message and count
        return res.status(200).json({ 
            success: true, 
            message: `Successfully deleted ${deletedCount} chat(s).`, 
            deletedCount: deletedCount 
        });
        // Alternatively, send 204 No Content if no message is needed
        // return res.status(204).send(); 

    } catch (error: any) {
        console.error(`[Chat Delete All] Error deleting chats for user ${username} (ID: ${userId}):`, error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting chat history.',
            error: error.message || String(error)
        });
    }
});

export default router; 