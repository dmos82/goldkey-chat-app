/* eslint-disable no-await-in-loop */
import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { generateEmbeddings } from '../utils/openaiHelper';
import { v4 as uuidv4 } from 'uuid';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { UserDocument } from '../models/UserDocument';
import { extractPdfTextWithPages, chunkTextWithPages } from '../utils/pdfUtils';
import mongoose from 'mongoose';
import { getChatCompletion } from '../utils/openaiHelper';
import { ChatCompletionMessageParam as OpenAIChatCompletionMessageParam } from 'openai/resources/chat';
import { protect, checkSession } from '../middleware/authMiddleware';
import { upsertVectors, PineconeVector, deleteVectorsByFilter, queryVectors } from '../utils/pineconeService';

const router: Router = express.Router();

// Define path for persistent storage (from ENV variable or default)
const USER_DOCUMENT_STORAGE_PATH = process.env.DOCUMENT_STORAGE_PATH || '/data/knowledge_base_docs';
console.log(`[Document Routes] User document storage path set to: ${USER_DOCUMENT_STORAGE_PATH}`);

// Type augmentation for custom request properties (Ideally in a types file)
declare global {
  namespace Express {
    interface Request {
      fileFilterError?: string; // Add optional fileFilterError property
    }
  }
}

// GET /api/documents - List only documents uploaded by the logged-in user (Protected)
router.get('/', protect, checkSession, async (req: Request, res: Response) => {
    console.log('[DocumentList] Fetching documents for user:', req.user?._id);

    if (!req.user?._id) {
        console.error('[DocumentList] User information missing from request after protect middleware.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const userId = req.user._id;

    try {
        // Log the MongoDB connection state
        console.log(`[DocumentList] MongoDB connection state: ${mongoose.connection.readyState}`);

        // Updated query to filter by userId and sourceType
        const query = UserDocument.find({
            userId: new mongoose.Types.ObjectId(userId), // Convert string userId to ObjectId
            sourceType: 'user'
        })
            .select('fileName originalFileName uploadTimestamp totalChunks fileSize mimeType') // Keep selection
            .sort({ uploadTimestamp: -1 });  // Keep sorting

        console.log('[DocumentList] Executing query:', query.getFilter());

        const documents = await query;

        console.log(`[DocumentList] Found ${documents.length} documents for user ${userId}.`);
        if (documents.length > 0) {
            console.log('[DocumentList] First document:', {
                id: documents[0]._id,
                fileName: documents[0].fileName,
                originalFileName: documents[0].originalFileName,
                uploadTimestamp: documents[0].uploadTimestamp
            });
        }
        
        return res.status(200).json({
            success: true,
            documents: documents.map(doc => ({
                id: doc._id,
                fileName: doc.originalFileName, // Changed to use originalFileName for display
                uploadTimestamp: doc.uploadTimestamp,
                totalChunks: doc.totalChunks,
                fileSize: doc.fileSize,
                mimeType: doc.mimeType
            }))
        });
    } catch (error) {
        console.error('[DocumentList] Error fetching documents:', error);
        if (error instanceof Error) {
            console.error('[DocumentList] Error stack:', error.stack);
        }
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch document list.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// Configuration
const KNOWLEDGE_BASE_DIR = path.resolve(__dirname, '../../../../knowledge_base_docs');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Ensure uploads directory exists
(async () => {
    try {
        await fs.access(UPLOADS_DIR);
    } catch {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        console.log('[DocumentRoutes] Created uploads directory:', UPLOADS_DIR);
    }
})();

// Utility function to validate filename
const isValidFilename = (filename: string): boolean => {
    // Check for directory traversal attempts and invalid characters
    const invalidChars = /[/\\<>:"|?*]/;
    return !invalidChars.test(filename) && 
           !filename.includes('..') && 
           (filename.endsWith('.pdf') || filename.endsWith('.txt'));
};

// Utility function to get content type
const getContentType = (filename: string): string => {
    return filename.endsWith('.pdf') ? 'application/pdf' : 'text/plain';
};

// GET /api/documents/system/:filename - Serve SYSTEM document files (Public)
router.get('/system/:filename', async (req: Request, res: Response) => {
    const { filename } = req.params;

    // 1. Validate filename
    if (!filename || !isValidFilename(filename)) {
        console.error(`[DocumentServe] Invalid filename requested: ${filename}`);
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid filename. Only .pdf and .txt files are allowed.' 
        });
    }

    try {
        // 2. Construct full file path
        const filePath = path.join(KNOWLEDGE_BASE_DIR, filename);
        console.log(`[DocumentServe] Attempting to access file at path: ${filePath}`);
        console.log(`[DocumentServe] Base directory (KNOWLEDGE_BASE_DIR): ${KNOWLEDGE_BASE_DIR}`);

        // 3. Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            console.error(`[DocumentServe] File not found: ${filename}`);
            return res.status(404).json({ 
                success: false, 
                message: 'Document not found.' 
            });
        }

        // 4. Set content type and serve file
        const contentType = getContentType(filename);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        // 5. Send file
        return res.sendFile(filePath);

    } catch (error) {
        console.error(`[DocumentServe] Error serving file ${filename}:`, error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error serving document.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// System prompt template for chat completions
const SYSTEM_PROMPT_TEMPLATE = `You are an AI assistant specializing in the provided insurance documents. Your task is to answer the user's question accurately and concisely, based *exclusively* on the text within the 'Context' section below.

Instructions:
1. Read the user's question carefully.
2. Thoroughly analyze the provided 'Context' which contains relevant document excerpts.
3. Synthesize your answer using *only* the information found in the 'Context'. Do not use any prior knowledge or external information.
4. If the 'Context' contains the information needed to answer the question, provide the answer directly.
5. If the 'Context' does not contain the necessary information, state clearly: "I cannot answer this question based on the provided documents."
6. Do not make up information or speculate beyond the provided text.

Context:
------
\${context}
------`;

// Configure multer for disk storage
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        // Save uploads directly to the persistent storage path
        cb(null, USER_DOCUMENT_STORAGE_PATH);
    },
    filename: (_req, file, cb) => {
        // Generate a unique filename while preserving the original extension
        const ext = path.extname(file.originalname);
        const uniqueId = uuidv4();
        cb(null, `${uniqueId}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
    fileFilter: (req: Request, file, cb): void => {
        if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
            return cb(null, true); // Allowed
        } else {
            // Disallowed, attach error to request
            req.fileFilterError = 'Invalid file type. Only PDF and TXT are allowed.';
            return cb(null, false); // Reject the file
        }
    }
});

// POST /api/documents/upload endpoint (Protected)
router.post('/upload', protect, checkSession, upload.single('file'), async (req: Request, res: Response) => {
    if (req.fileFilterError) {
        return res.status(400).json({ success: false, message: req.fileFilterError });
    }
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded or upload rejected.' });
    }

    if (!req.user?._id) {
        console.error('[Upload] User ID missing from request after auth middleware.');
        // Optionally delete the uploaded file if user is not authenticated properly
        if (req.file?.path) await fs.unlink(req.file.path).catch(err => console.error("Error deleting temp file:", err));
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const userId = req.user._id.toString(); // Get user ID as string

    const file = req.file!; // Non-null assertion after checks
    const originalFileName = file.originalname;
    const savedFileName = file.filename;
    let fileText = '';

    try {
        console.log(`[Upload] Received file: ${originalFileName}, type: ${file.mimetype}, User: ${userId}`);

        // Read file content
        const fileBuffer = await fs.readFile(file.path);
        if (file.mimetype === 'application/pdf') {
            const pageTexts = await extractPdfTextWithPages(fileBuffer);
            fileText = pageTexts.map(pt => pt.text).join('\\n\\n'); // Use double newline as separator
        } else {
            fileText = fileBuffer.toString();
        }

        // Chunk the text (using a simple strategy for now, consider RecursiveCharacterTextSplitter later)
        // TODO: Use a more sophisticated chunking strategy if needed
        const chunkSize = 1000;
        const chunkOverlap = 200;
        const textChunks: string[] = [];
        for (let i = 0; i < fileText.length; i += chunkSize - chunkOverlap) {
             const chunk = fileText.substring(i, i + chunkSize);
             if (chunk.trim().length > 0) { // Avoid empty chunks
                 textChunks.push(chunk);
             }
        }
        // const chunks = chunkTextWithPages([{ pageNumber: 1, text: fileText }]); // Old chunking
        console.log(`[Upload] Chunked ${originalFileName} into ${textChunks.length} chunks.`);

        if (textChunks.length === 0) {
            throw new Error("File chunking resulted in zero chunks.");
        }

        // Save document metadata to MongoDB *before* embedding/upserting
        const newDocument = new UserDocument({
            userId: new mongoose.Types.ObjectId(userId),
            fileName: savedFileName, // Store the unique saved filename
            originalFileName: originalFileName,
            totalChunks: textChunks.length,
            fileSize: file.size,
            mimeType: file.mimetype,
            sourceType: 'user', // Mark as user document
            status: 'processing' // Initial status
        });
        await newDocument.save();
        // Add type check/assertion for _id before calling toString()
        if (!newDocument?._id) {
            throw new Error("Failed to save document metadata or retrieve ID.");
        }
        const documentId = (newDocument._id as mongoose.Types.ObjectId).toString(); 
        console.log(`[Upload] Saved document metadata to DB. ID: ${documentId}`);


        // Generate embeddings
        // TODO: Consider batching generateEmbeddings if many chunks
        console.log(`[Upload] Generating ${textChunks.length} embeddings for doc ${documentId}...`);
        const embeddings = await generateEmbeddings(textChunks);
        console.log(`[Upload] Generated ${embeddings.length} embeddings for doc ${documentId}.`);

        if (embeddings.length !== textChunks.length) {
            throw new Error(`Embedding count (${embeddings.length}) does not match chunk count (${textChunks.length}) for doc ${documentId}`);
        }

        // Prepare vectors for Pinecone
        const vectors: PineconeVector[] = textChunks.map((chunkText, index) => {
            const vectorId = `${documentId}_chunk_${index}`; // Create a unique ID for each vector chunk
            return {
                id: vectorId,
                values: embeddings[index],
                metadata: {
                    documentId: documentId,
                    userId: userId,
            originalFileName: originalFileName,
                    chunkIndex: index,
                    text: chunkText, // Include the chunk text in metadata
                    sourceType: 'user' // Mark source type in metadata
                }
            };
        });

        // Upsert vectors to Pinecone
        console.log(`[Upload] Upserting ${vectors.length} vectors to Pinecone for doc ${documentId}...`);
        // Determine namespace if needed (e.g., based on user ID or document type)
        // For now, using default namespace
        await upsertVectors(vectors);
        console.log(`[Upload] Successfully upserted vectors for doc ${documentId}.`);

        // Update document status in MongoDB
        await UserDocument.findByIdAndUpdate(documentId, { status: 'completed' });
        console.log(`[Upload] Updated document ${documentId} status to 'completed'.`);

        return res.status(201).json({
            success: true, 
            message: `Document '${originalFileName}' uploaded and processed successfully.`,
            documentId: documentId,
            chunksProcessed: textChunks.length
        });

    } catch (error: any) {
        console.error(`[Upload] Error processing file ${originalFileName} for user ${userId}:`, error);
        // Attempt to clean up temp file on error
        if (req.file?.path) {
            await fs.unlink(req.file.path).catch(err => console.error("[Upload] Error deleting temp file during error handling:", err));
        }
        // If MongoDB doc was created, update status to 'failed'
        if (error.documentId) { // Check if we have the ID from a previous step
             await UserDocument.findByIdAndUpdate(error.documentId, { status: 'failed', errorMessage: error.message }).catch(err => console.error("[Upload] Error updating document status to failed:", err));
        } else if (userId && originalFileName) { // Fallback: try finding by userId and filename if ID wasn't captured yet
             await UserDocument.findOneAndUpdate(
                 { userId: new mongoose.Types.ObjectId(userId), originalFileName: originalFileName, status: 'processing' },
                 { status: 'failed', errorMessage: error.message }
             ).catch(err => console.error("[Upload] Error updating document status to failed via fallback:", err));
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to process document.',
            error: error.message || String(error)
        });
    }
});

// POST /api/chat - Main chat endpoint (currently in documentRoutes.ts)
router.post('/chat', protect, checkSession, async (req: Request, res: Response) => {
    const { query, history = [], searchMode = 'user' } = req.body; // Default to user if not specified
    const userId = req.user?._id;

    console.log(`[Chat - in documentRoutes] Received query: "${query.substring(0, 50)}..." for user ${userId}. History length: ${history.length}. Search Mode: ${searchMode}`);

    if (!userId) {
        console.error('[Chat - in documentRoutes] User ID missing from request.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!query) {
        console.warn('[Chat - in documentRoutes] Empty query received.');
        return res.status(400).json({ success: false, message: 'Query is required.' });
    }

    try {
        // 1. Generate embedding for the query
        console.log('[Chat - in documentRoutes] Generating embedding for query...');
        const queryEmbedding = await generateEmbeddings([query]);
        if (!queryEmbedding || queryEmbedding.length === 0 || queryEmbedding[0].length === 0) {
            throw new Error('Failed to generate query embedding.');
        }
        console.log('[Chat - in documentRoutes] Query embedding generated successfully.');

        // 2. Query Pinecone for relevant document chunks
        const topK = 5; // Number of chunks to retrieve
        let filter: Record<string, any> = { sourceType: searchMode }; // Base filter on searchMode ('user' or 'system')
        
        if (searchMode === 'user') {
            filter.userId = userId.toString(); // Add userId filter only for user documents
        } 
        // No namespace needed if system/user docs are in the same index but differentiated by metadata
        console.log(`[Chat - in documentRoutes] Querying Pinecone with topK=${topK}, filter: ${JSON.stringify(filter)}`);

        const queryResults = await queryVectors(queryEmbedding[0], topK, filter);
        
        // Extract context from Pinecone results
        let context = '';
        const sourceDocuments: any[] = []; // To store metadata for display/reference
        if (queryResults && queryResults.matches && queryResults.matches.length > 0) {
            console.log(`[Chat - in documentRoutes] Pinecone returned ${queryResults.matches.length} matches.`);
            context = queryResults.matches
                .map((match: any) => match.metadata?.text || '') // Extract text from metadata
                .join('\n\n---\n\n'); // Join chunks with separator

            // Store metadata for source referencing
            queryResults.matches.forEach((match: any) => {
                if (match.metadata) {
                     // Add score and check for necessary metadata fields
                     const source = {
                        id: match.id, 
                        score: match.score,
                        fileName: match.metadata.originalFileName || 'Unknown File',
                        documentId: match.metadata.documentId || null,
                        chunkIndex: typeof match.metadata.chunkIndex === 'number' ? match.metadata.chunkIndex : -1,
                        type: match.metadata.sourceType || searchMode // Use metadata sourceType if available, else fallback
                        // text: match.metadata.text // Optionally include text snippet
                     };
                     // Only add if essential info is present
                     if (source.documentId || (source.type === 'system' && source.fileName !== 'Unknown File')) {
                         sourceDocuments.push(source);
                     }
                }
            });
            
            if (!context.trim()) {
                 console.warn("[Chat - in documentRoutes] Pinecone matches found, but no text content in metadata.");
            }
        } else {
            console.log('[Chat - in documentRoutes] No relevant document chunks found in Pinecone for the query.');
        }

        if (!context.trim()) {
            console.log('[Chat - in documentRoutes] No context found. Responding based on general knowledge (or returning specific message).');
            context = "No relevant context found in documents."; // Provide placeholder context
        }

        // 3. Format the prompt for OpenAI (Using existing SYSTEM_PROMPT_TEMPLATE)
        const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('${context}', context);

        // Build conversation history
        const messages: OpenAIChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            ...history // Assuming history is already in the correct [{ role: 'user'/'assistant', content: '...' }] format
                .filter((msg: any) => msg.role && msg.content), // Basic validation
            { role: 'user', content: query }
        ];
        // console.log('[Chat - in documentRoutes] Constructed messages for OpenAI:', JSON.stringify(messages, null, 2)); 

        // 4. Call OpenAI API
        console.log('[Chat - in documentRoutes] Sending request to OpenAI...');
        console.time('OpenAICallDuration');
        const completion = await getChatCompletion(messages);
        console.timeEnd('OpenAICallDuration');

        if (!completion?.choices?.[0]?.message?.content) {
            console.error('[Chat - in documentRoutes] Failed to get completion from OpenAI or received null/empty response.');
            throw new Error('Failed to get response from AI assistant.');
        }
        const answer = completion.choices[0].message.content.trim();
        console.log('[Chat - in documentRoutes] Received response from OpenAI.');

        // 5. Prepare response
        const responseObject = {
            success: true,
            answer,
            sources: sourceDocuments.slice(0, 3) // Limit sources for brevity
        };
        console.log('[Chat - in documentRoutes] Sending final response. Answer length:', answer.length, 'Sources count:', responseObject.sources.length);
        return res.status(200).json(responseObject);

    } catch (error: any) {
        console.error('[Chat - in documentRoutes] Error processing chat query:', error);
        return res.status(500).json({
            success: false,
            message: 'Error processing chat query.',
            error: error.message || String(error)
        });
    }
});

// DELETE /api/documents/:id - Delete a specific document and its chunks (Protected)
router.delete('/:id', protect, checkSession, async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?._id;

    console.log(`[DocumentDelete] Request to delete document ${id} by user ${userId}`);

    if (!userId) {
        console.error('[DocumentDelete] User ID missing from request.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
        console.error(`[DocumentDelete] Invalid document ID format: ${id}`);
        return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }

    try {
        // 1. Find the document to ensure it belongs to the user
        const document = await UserDocument.findOne({ _id: id, userId: userId });

        if (!document) {
            console.warn(`[DocumentDelete] Document ${id} not found or user ${userId} mismatch.`);
            return res.status(404).json({ success: false, message: 'Document not found or access denied.' });
        }

        // 2. Delete vectors from Pinecone using the document ID
        console.log(`[DocumentDelete] Deleting vectors from Pinecone for document ID: ${id}`);
        try {
            await deleteVectorsByFilter({ documentId: id });
            console.log(`[DocumentDelete] Pinecone vector deletion initiated for document ID: ${id}.`);
        } catch (pineconeError: any) {
            // Log the error but proceed with DB deletion - eventual consistency
            console.error(`[DocumentDelete] Error deleting vectors from Pinecone for doc ${id} (continuing DB delete):`, pineconeError);
            // Optionally, mark the document for later cleanup instead of proceeding?
        }

        // 3. Delete the document metadata from MongoDB
        console.log(`[DocumentDelete] Deleting document metadata from MongoDB for ID: ${id}`);
        await UserDocument.findByIdAndDelete(id);
        console.log(`[DocumentDelete] Successfully deleted document metadata from MongoDB for ID: ${id}`);

        // 4. Optional: Delete the actual file from storage if it exists 
        //    (Requires knowing the saved filename, e.g., document.fileName)
        if (document.fileName) { // Assuming fileName stores the unique name in /uploads
             const filePath = path.join(UPLOADS_DIR, document.fileName);
             try {
            await fs.unlink(filePath);
                 console.log(`[DocumentDelete] Deleted stored file: ${filePath}`);
             } catch (unlinkError: any) {
                 // Log if file deletion fails, but don't block response
                 if (unlinkError.code !== 'ENOENT') { // Ignore 'file not found' errors
                     console.error(`[DocumentDelete] Error deleting stored file ${filePath}:`, unlinkError);
                 }
            }
        }

        return res.status(200).json({ success: true, message: 'Document deleted successfully.' });

    } catch (error: any) {
        console.error(`[DocumentDelete] Error deleting document ${id}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting document.',
            error: error.message || String(error)
        });
    }
});

// Extend Multer Request interface to include potential filter error
declare global {
    namespace Express {
        interface Request {
            fileFilterError?: string;
        }
    }
}

// Add multer error handling middleware *before* the routes that use multer
router.use((err: any, _req: Request, res: Response, next: Function) => {
    if (err instanceof multer.MulterError) {
        console.warn('[MulterError]', err.code, err.message);
        return res.status(400).json({ success: false, message: `File upload error: ${err.message}` });
    } else if (err && err.message && err.message.startsWith('Invalid file type')) {
        // Handle the custom error from fileFilter
        console.warn('[FileType Error]', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
    // If it's not a handled error, explicitly pass it to the next error handler
    next(err); 
    return; // Explicitly return after calling next
});

// GET /api/documents/user/:documentId - Serve specific USER document files (Needs protection)
router.get('/user/:documentId', protect, async (req: Request, res: Response) => {
    const { documentId } = req.params;
    console.log(`[DocumentServe User] Request for documentId: ${documentId}`);

    if (!mongoose.Types.ObjectId.isValid(documentId)) {
        console.error(`[DocumentServe User] Invalid document ID format: ${documentId}`);
        return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }

    try {
        // Find the document metadata in MongoDB
        const doc = await UserDocument.findById(documentId);
        if (!doc) {
            console.error(`[DocumentServe User] Document metadata not found for ID: ${documentId}`);
            return res.status(404).json({ success: false, message: 'Document metadata not found.' });
        }

        // Explicit check that req.user exists (should be guaranteed by 'protect')
        if (!req.user?._id) {
            console.error('[DocumentServe User] req.user._id missing after protect middleware.');
            return res.status(500).json({ success: false, message: 'Internal server error: User context lost.' });
        }

        // Check 1: Document must have a userId assigned
        if (!doc.userId) {
            console.warn(`[DocumentServe User] Access denied! Document ${documentId} is missing userId.`);
            return res.status(403).json({ success: false, message: 'Forbidden: Document owner information missing.' });
        }
        
        // Check 2: Ensure this route only serves 'user' type documents
        if (doc.sourceType !== 'user') {
             console.warn(`[DocumentServe User] Access denied! Attempt to access non-user doc via user route. DocID: ${doc._id}, Type: ${doc.sourceType}, ReqUser: ${req.user._id}`);
             return res.status(403).json({ success: false, message: 'Forbidden: Invalid document type for this route.' });
        }

        // Check 3: Verify ownership by comparing stringified IDs
        // Ensure both _id fields are converted to string for comparison
        if (doc.userId.toString() !== req.user._id.toString()) { 
             // Log values on failure
             console.warn(`[DocumentServe User] Access denied! User ID mismatch. DocUserID: ${doc.userId.toString()}, ReqUserID: ${req.user._id.toString()}`);
             return res.status(403).json({ success: false, message: 'Forbidden: You do not have access to this document.' });
        }

        // --- If all checks pass, proceed to serve file ---
        console.log(`[DocumentServe User] Authorization PASSED for DocID: ${documentId}, UserID: ${req.user._id}`);

        // Construct the full path using the PERSISTENT storage path and the saved (UUID-based) filename
        const filePath = path.join(USER_DOCUMENT_STORAGE_PATH, doc.fileName);
        console.log(`[DocumentServe User] Attempting to serve file from persistent storage: ${filePath}`);

        // Check if file exists on disk
        try {
            await fs.access(filePath);
        } catch (error) {
            console.error(`[DocumentServe User] File not found on persistent disk: ${filePath}`);
            // Optionally consider cleanup if metadata exists but file doesn't
            return res.status(404).json({ success: false, message: 'Document file not found on server.' });
        }

        // Set headers and send file
        const contentType = getContentType(doc.fileName); // Use saved filename
        res.setHeader('Content-Type', contentType);
        // Use original filename for download prompt
        res.setHeader('Content-Disposition', `inline; filename="${doc.originalFileName}"`);
        return res.sendFile(filePath);

    } catch (error) {
        console.error(`[DocumentServe User] Error serving user document ${documentId}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error serving user document.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

// POST /api/documents/generate-chat - Generate chat completion based on user documents (Protected)
router.post('/generate-chat', protect, checkSession, async (req: Request, res: Response) => {
    const { query } = req.body;
    const userId = req.user?._id;

    console.log(`[GenerateChat] Received query: "${query}" for user ${userId}`);

    if (!userId) {
        console.error('[GenerateChat] User ID missing from request.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ success: false, message: 'Query is required and must be a string.' });
    }

    try {
        // 1. Generate embedding for the user query
        console.log('[GenerateChat] Generating embedding for query...');
        const queryEmbedding = await generateEmbeddings([query]);
        if (!queryEmbedding || queryEmbedding.length === 0 || queryEmbedding[0].length === 0) {
            throw new Error('Failed to generate query embedding.');
        }
        console.log('[GenerateChat] Query embedding generated.');

        // 2. Query Pinecone for relevant document chunks specific to the user
        const topK = 5; // Number of chunks to retrieve
        const filter = { 
            userId: userId.toString(), 
            sourceType: 'user' // Ensure we only query user's documents
        };
        console.log(`[GenerateChat] Querying Pinecone with topK=${topK}, filter: ${JSON.stringify(filter)}`);

        const queryResults = await queryVectors(queryEmbedding[0], topK, filter);
        
        // Extract context from Pinecone results
        let context = '';
        const sourceDocuments: any[] = []; // To store metadata for display/reference
        if (queryResults && queryResults.matches && queryResults.matches.length > 0) {
            console.log(`[GenerateChat] Pinecone returned ${queryResults.matches.length} matches.`);
            context = queryResults.matches
                .map((match: any) => match.metadata?.text || '') // Extract text from metadata
                .join('\n\n---\n\n'); // Join chunks with separator

            // Store metadata for source referencing
            queryResults.matches.forEach((match: any) => {
                if (match.metadata) {
                    sourceDocuments.push({
                        id: match.id, // Vector ID (e.g., docId_chunk_idx)
                        score: match.score,
                        fileName: match.metadata.originalFileName,
                        documentId: match.metadata.documentId,
                        chunkIndex: match.metadata.chunkIndex,
                        // text: match.metadata.text // Optionally include text snippet
                    });
                }
            });
            
            if (!context.trim()) {
                 console.warn("[GenerateChat] Pinecone matches found, but no text content in metadata.");
            }
        } else {
            console.log('[GenerateChat] No relevant document chunks found in Pinecone for the query.');
        }

        if (!context.trim()) {
            // Handle case where no context is found - either state it or try without context?
            console.log('[GenerateChat] No context found. Responding based on general knowledge (or returning specific message).');
            // Option 1: Return a specific message
            // return res.status(200).json({ success: true, response: "I couldn't find relevant information in your uploaded documents to answer that question.", sources: [] });
            // Option 2: Proceed without context (might hallucinate)
            context = "No relevant context found in user documents."; // Provide placeholder context
        }

        // 3. Construct the prompt for the LLM
        const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('${context}', context);
        const messages: OpenAIChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
        ];
        console.log('[GenerateChat] Sending request to OpenAI...');
        // console.log('[GenerateChat] System Prompt:', systemPrompt); // Debug: Log the prompt

        // 4. Get completion from OpenAI
        const completion = await getChatCompletion(messages);
        console.log('[GenerateChat] Received response from OpenAI.');

        if (!completion?.choices?.[0]?.message?.content) {
            throw new Error('Failed to get a valid response from the AI model.');
        }

        const responseText = completion.choices[0].message.content;

        return res.status(200).json({ 
            success: true, 
            response: responseText,
            sources: sourceDocuments // Include source metadata in the response
        });

    } catch (error: any) {
        console.error('[GenerateChat] Error generating chat response:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating chat response.',
            error: error.message || String(error)
        });
    }
});

// DELETE /api/documents/user/all - Delete ALL documents for the logged-in user (Protected)
router.delete('/user/all', protect, async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const userIdString = userId?.toString();

    console.log(`[DocumentDelete All] Request received for user ${userIdString}`);

    if (!userId) {
        console.error('[DocumentDelete All] User ID missing from request.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    let deletedDbCount = 0;
    let attemptedFileDeletions = 0;
    let successfulFileDeletions = 0;
    let failedFileDeletions: string[] = [];

    try {
        // 1. Find all user document metadata to get filenames
        const documentsToDelete = await UserDocument.find({
            userId: new mongoose.Types.ObjectId(userIdString),
            sourceType: 'user'
        }).select('fileName');

        const fileNamesToDelete = documentsToDelete.map(doc => doc.fileName).filter(Boolean); // Filter out any null/undefined filenames
        attemptedFileDeletions = fileNamesToDelete.length;
        console.log(`[DocumentDelete All] Found ${documentsToDelete.length} document records and ${attemptedFileDeletions} filenames for user ${userIdString}.`);

        if (documentsToDelete.length === 0) {
            return res.status(200).json({ success: true, message: 'No user documents found to delete.', deletedDbCount: 0, attemptedFileDeletions: 0 });
        }

        // 2. Delete DB records
        console.log(`[DocumentDelete All] Deleting ${documentsToDelete.length} records from MongoDB for user ${userIdString}...`);
        const dbResult = await UserDocument.deleteMany({
            userId: new mongoose.Types.ObjectId(userIdString),
            sourceType: 'user'
        });
        deletedDbCount = dbResult.deletedCount;
        console.log(`[DocumentDelete All] Successfully deleted ${deletedDbCount} records from MongoDB.`);

        // 3. Delete Pinecone vectors (fire-and-forget style with error logging)
        console.log(`[DocumentDelete All] Initiating Pinecone vector deletion for user ${userIdString}...`);
        deleteVectorsByFilter({ userId: userIdString, sourceType: 'user' })
            .then(() => {
                console.log(`[DocumentDelete All] Pinecone vector deletion successfully initiated for user ${userIdString}.`);
            })
            .catch(pineconeError => {
                console.error(`[DocumentDelete All] Error initiating Pinecone vector deletion for user ${userIdString}:`, pineconeError);
                // Log error but don't fail the entire operation
            });

        // 4. Delete physical files
        console.log(`[DocumentDelete All] Attempting to delete ${attemptedFileDeletions} physical files for user ${userIdString} from ${USER_DOCUMENT_STORAGE_PATH}...`);
        for (const fileName of fileNamesToDelete) {
            const filePath = path.join(USER_DOCUMENT_STORAGE_PATH, fileName);
            try {
                await fs.unlink(filePath);
                console.log(`[DocumentDelete All] Successfully deleted file: ${filePath}`);
                successfulFileDeletions++;
            } catch (fileError: any) {
                if (fileError.code === 'ENOENT') {
                    console.warn(`[DocumentDelete All] File not found (possibly already deleted): ${filePath}`);
                    // Optionally count this as a "success" if the goal is absence
                } else {
                    console.error(`[DocumentDelete All] Failed to delete file ${filePath}:`, fileError);
                    failedFileDeletions.push(fileName); 
                }
            }
        }
        console.log(`[DocumentDelete All] File deletion summary: ${successfulFileDeletions} succeeded, ${failedFileDeletions.length} failed.`);

        // 5. Return success response
        return res.status(200).json({
            success: true,
            message: `Deleted ${deletedDbCount} document records. Attempted deletion of ${attemptedFileDeletions} files (${successfulFileDeletions} successful). Check server logs for details.`,
            deletedDbCount,
            attemptedFileDeletions,
            successfulFileDeletions,
            failedFileDeletions: failedFileDeletions.length > 0 ? failedFileDeletions : undefined // Only include if failures occurred
        });

    } catch (error: any) {
        console.error(`[DocumentDelete All] Critical error during deletion for user ${userIdString}:`, error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting user documents.',
            error: error.message || String(error)
        });
    }
});

export default router;