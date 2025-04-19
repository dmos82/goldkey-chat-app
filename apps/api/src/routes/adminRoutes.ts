import express, { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import fs from 'fs'; // Use synchronous fs for initial check/create
import { v4 as uuidv4 } from 'uuid';
import { protect, isAdmin, checkSession } from '../middleware/authMiddleware';
import { UserDocument, IUserDocument } from '../models/UserDocument';
import User from '../models/UserModel';
import bcrypt from 'bcryptjs';
// --- Import Utilities ---
// Remove the entire block importing from chromaService (lines 12-17)
// import { 
//     getSystemKbCollection, 
//     addDocuments as addEmbeddingsToCollection, 
//     deleteDocumentChunksByDocId, 
//     COLLECTIONS
// } from '../utils/chromaService';
import { generateEmbeddings } from '../utils/openaiHelper';
import { extractPdfTextWithPages, chunkTextWithPages } from '../utils/pdfUtils'; // Reusing utils
// Import Pinecone service functions
import { upsertVectors, deleteVectorsByFilter, PineconeVector } from '../utils/pineconeService';
import fsPromises from 'fs/promises'; // Ensure fs/promises is imported
import { processAndEmbedDocument } from '../utils/documentProcessor'; // Use the dedicated processor

const router: Router = express.Router();

// --- Corrected Knowledge Base Path Definition using Render Disk Path ---
const storageBasePath = '/data'; // Use the chosen Render Disk Mount Path
const KNOWLEDGE_BASE_DIR = path.join(storageBasePath, 'knowledge_base_docs');
console.log(`[Admin Routes] KNOWLEDGE_BASE_DIR configured to: ${KNOWLEDGE_BASE_DIR}`);

// Ensure the target directory exists (Create it if it doesn't) - SAFER CHECK
try {
    // Only attempt mkdir if the base path exists (relevant for local dev)
    if (fs.existsSync(storageBasePath) && !fs.existsSync(KNOWLEDGE_BASE_DIR)) {
        fs.mkdirSync(KNOWLEDGE_BASE_DIR, { recursive: true });
        console.log(`[Admin Routes FS Setup] Created knowledge base directory: ${KNOWLEDGE_BASE_DIR}`);
    } else if (!fs.existsSync(storageBasePath)) {
        console.warn(`[Admin Routes FS Setup] Base storage path ${storageBasePath} does not exist. Skipping KNOWLEDGE_BASE_DIR check/creation (expected in local dev).`);
    }
} catch (err) {
     console.error(`[Admin Routes FS Setup Error] Failed to check/create knowledge base directory: ${KNOWLEDGE_BASE_DIR}`, err);
     // Handle error as needed
}

// Define temporary upload directory (using /tmp is fine)
const TEMP_UPLOAD_DIR = '/tmp/gkchatty_uploads';
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true }); // Ensure temp dir exists

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use the corrected TEMP_UPLOAD_DIR for multer destination
        const uploadPath = path.join(TEMP_UPLOAD_DIR, 'temp_admin_uploads');
        fs.mkdir(uploadPath, { recursive: true }, (err) => { // Use callback form for multer
            if (err) {
                 console.error('Error creating multer destination subdir', err);
                 return cb(err, uploadPath); // Pass error to multer
            }
             cb(null, uploadPath);
        });
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, uniqueSuffix + extension);
    }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept only specific file types
    const allowedMimes = ['application/pdf', 'text/plain', 'text/markdown'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        // Pass the error message through the request object
        (req as any).fileFilterError = `Invalid file type: ${file.mimetype}. Only PDF, TXT, MD allowed for System KB.`;
        cb(null, false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 1024 * 1024 * 50 } // 50MB limit
});

// Apply protect, checkSession, and isAdmin middleware to all admin routes
router.use(protect, checkSession, isAdmin);

// --- GET List System KB Documents --- 
router.get('/system-kb/documents', async (req: Request, res: Response): Promise<void | Response> => {
    console.log('[Admin Routes] Request received for listing System KB documents.');
    try {
        const systemDocs = await UserDocument.find({ sourceType: 'system' })
            .select('_id originalFileName uploadTimestamp fileSize mimeType status')
            .sort({ uploadTimestamp: -1 });
        console.log(`[Admin Routes] Found ${systemDocs.length} System KB documents.`);
        return res.status(200).json({ success: true, documents: systemDocs });
    } catch (error) {
        console.error('[Admin Routes] Error fetching System KB documents:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching System KB documents.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * @route   POST /api/admin/system-kb/upload
 * @desc    Upload a document to the System Knowledge Base
 * @access  Private (Admin only)
 */
router.post('/system-kb/upload', upload.single('file'), async (req: Request, res: Response): Promise<void | Response> => {
    if ((req as any).fileFilterError) {
        return res.status(400).json({ success: false, message: (req as any).fileFilterError });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const file = req.file;
    const originalFileName = file.originalname;
    const savedFileName = file.filename; // Unique name from multer
    const tempFilePath = file.path;
    let fileText = '';
    let documentId: string | null = null; // To store the MongoDB ID

    console.log(`[Admin Upload] Received System KB file: ${originalFileName}, type: ${file.mimetype}`);

    try {
        // 1. Read file content
        const fileBuffer = await fs.promises.readFile(tempFilePath);
        if (file.mimetype === 'application/pdf') {
            // Using the same PDF util as documentRoutes
            const pageTexts = await extractPdfTextWithPages(fileBuffer);
            fileText = pageTexts.map(pt => pt.text).join('\n\n');
        } else { // txt, md
            fileText = fileBuffer.toString('utf-8');
        }
        console.log(`[Admin Upload] Extracted text from ${originalFileName}. Length: ${fileText.length}`);

        // 2. Chunk the text (Simple strategy)
        const chunkSize = 1000;
        const chunkOverlap = 200;
        const textChunks: string[] = [];
        for (let i = 0; i < fileText.length; i += chunkSize - chunkOverlap) {
             const chunk = fileText.substring(i, i + chunkSize);
             if (chunk.trim().length > 0) { textChunks.push(chunk); }
        }
        console.log(`[Admin Upload] Chunked ${originalFileName} into ${textChunks.length} chunks.`);
        if (textChunks.length === 0) throw new Error("File chunking resulted in zero chunks.");

        // 3. Save document metadata to MongoDB (SourceType: system)
        const newDocument = new UserDocument({
            // No userId for system documents
            fileName: savedFileName, // Store unique name
            originalFileName: originalFileName,
            totalChunks: textChunks.length,
            fileSize: file.size,
            mimeType: file.mimetype,
            sourceType: 'system', // Mark as system document
            status: 'processing'
        });
        await newDocument.save();
        // Ensure _id exists before proceeding
        if (!newDocument?._id) throw new Error("Failed to save System KB document metadata or retrieve ID.");
        documentId = (newDocument._id as mongoose.Types.ObjectId).toString();
        console.log(`[Admin Upload] Saved System KB doc metadata to DB. ID: ${documentId}`);

        // === START: Move file from temp to persistent storage ===
        const finalFilePath = path.join(KNOWLEDGE_BASE_DIR, savedFileName); // Use correct dir + unique name
        console.log(`[Admin Upload] Copying uploaded file from ${tempFilePath} to ${finalFilePath}`);
        await fs.promises.copyFile(tempFilePath, finalFilePath); // Copy the file
        await fs.promises.unlink(tempFilePath); // Delete the original temporary file
        console.log(`[Admin Upload] File copied from temp to persistent storage and temp file deleted.`);
        // Update document with the final path
        await UserDocument.findByIdAndUpdate(documentId, { 
            sourcePath: finalFilePath, // Store the absolute path on Render disk
            status: 'processing' // Keep processing status until vectors are done
         });
        console.log(`[Admin Upload] Updated document ${documentId} with final sourcePath.`);
        // === END: Move file ===

        // 4. Generate embeddings
        console.log(`[Admin Upload] Generating ${textChunks.length} embeddings for doc ${documentId}...`);
        const embeddings = await generateEmbeddings(textChunks);
        console.log(`[Admin Upload] Generated ${embeddings.length} embeddings.`);
        if (embeddings.length !== textChunks.length) {
             throw new Error(`Embedding count (${embeddings.length}) doesn't match chunk count (${textChunks.length})`);
        }

        // 5. Prepare vectors for Pinecone (SourceType: system, no userId)
        const vectors: PineconeVector[] = textChunks.map((chunkText, index) => ({
            id: `${documentId}_chunk_${index}`, // Unique vector ID
            values: embeddings[index],
            metadata: {
                documentId: documentId!,
                originalFileName: originalFileName,
                chunkIndex: index,
                text: chunkText,
                sourceType: 'system' // Mark source type in metadata
                // No userId metadata for system docs
            }
        }));

        // 6. Upsert vectors to Pinecone
        console.log(`[Admin Upload] Upserting ${vectors.length} vectors to Pinecone for System KB doc ${documentId}...`);
        // Assuming system/user docs share the same index, differentiated by metadata
        await upsertVectors(vectors);
        console.log(`[Admin Upload] Successfully upserted System KB vectors for doc ${documentId}.`);

        // 7. Update document status in MongoDB to completed
        await UserDocument.findByIdAndUpdate(documentId, { status: 'completed' });
        console.log(`[Admin Upload] Updated System KB doc ${documentId} status to 'completed'.`);

        return res.status(201).json({
            success: true,
            message: `System KB document '${originalFileName}' uploaded and processed successfully.`,
            documentId: documentId,
            chunksProcessed: textChunks.length
        });

    } catch (error: any) {
        console.error(`[Admin Upload] Error processing System KB file ${originalFileName}:`, error);
        if (tempFilePath) { // Attempt cleanup on error
            await fs.promises.unlink(tempFilePath).catch(err => console.error("[Admin Upload] Error deleting temp file during error handling:", err));
        }
        if (documentId) { // Attempt to mark DB entry as failed
             await UserDocument.findByIdAndUpdate(documentId, { status: 'failed', errorMessage: error.message }).catch(err => console.error("[Admin Upload] Error updating document status to failed:", err));
        }
        return res.status(500).json({
            success: false,
            message: 'Failed to process System KB document.',
            error: error.message || String(error)
        });
    }
});

// --- DELETE System KB Document --- 
router.delete('/system-kb/documents/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminUserId = req.user?._id; // ID of the admin performing the action

    console.log(`[Admin Delete] Request to delete System KB document ${id} by admin ${adminUserId}`);

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }

    try {
        // 1. Find the document to ensure it's a system document
        const document = await UserDocument.findById(id);

        if (!document) {
            console.warn(`[Admin Delete] System KB document ${id} not found.`);
            return res.status(404).json({ success: false, message: 'System KB document not found.' });
        }

        // Optional: Add an extra check for sourceType if needed
        if (document.sourceType !== 'system') {
             console.warn(`[Admin Delete] Document ${id} is not a System KB document (type: ${document.sourceType}).`);
            return res.status(400).json({ success: false, message: 'Invalid operation: Document is not a System KB document.' });
        }

        // 2. Delete vectors from Pinecone using the document ID
        console.log(`[Admin Delete] Deleting vectors from Pinecone for System KB document ID: ${id}`);
        try {
            // Using the same filter pattern as user docs
            await deleteVectorsByFilter({ documentId: id }); 
            console.log(`[Admin Delete] Pinecone vector deletion initiated for System KB document ID: ${id}.`);
        } catch (pineconeError: any) {
            // Log the error but proceed with DB deletion
            console.error(`[Admin Delete] Error deleting vectors from Pinecone for System KB doc ${id} (continuing DB delete):`, pineconeError);
        }

        // 3. Delete the document metadata from MongoDB
        console.log(`[Admin Delete] Deleting System KB document metadata from MongoDB for ID: ${id}`);
        await UserDocument.findByIdAndDelete(id);
        console.log(`[Admin Delete] Successfully deleted System KB document metadata from MongoDB for ID: ${id}`);

        // 4. Optional: Delete the actual file from storage if applicable
        //    System KB files might be managed differently (e.g., git LFS, separate store)
        //    If they are stored similarly to user uploads (using document.fileName):
        /*
        if (document.fileName) { 
             const filePath = path.join(SOME_SYSTEM_KB_STORAGE_PATH, document.fileName);
             try {
                 await fs.unlink(filePath);
                 console.log(`[Admin Delete] Deleted stored System KB file: ${filePath}`);
             } catch (unlinkError: any) {
                 if (unlinkError.code !== 'ENOENT') { 
                     console.error(`[Admin Delete] Error deleting stored file ${filePath}:`, unlinkError);
                 }
             }
        }
        */

        return res.status(200).json({ success: true, message: 'System KB document deleted successfully.' });

    } catch (error: any) {
        console.error(`[Admin Delete] Error deleting System KB document ${id}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting System KB document.',
            error: error.message || String(error)
        });
    }
});

// --- RE-INDEX System KB Document ---
router.post('/system-kb/reindex/:documentId', isAdmin, async (req: Request, res: Response) => {
    const { documentId } = req.params;
    const adminUserId = req.user?._id;

    console.log(`[Admin Reindex] Request received to re-index System KB document ${documentId} by admin ${adminUserId}`);

    if (!mongoose.Types.ObjectId.isValid(documentId)) {
        return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }

    let document: IUserDocument | null = null;
    let tempFilePath: string | undefined = undefined; // Not strictly needed here but pattern exists

    try {
        // 1. Fetch Document Metadata & Verify Type
        document = await UserDocument.findById(documentId);
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found.' });
        }
        if (document.sourceType !== 'system') {
            return res.status(400).json({ success: false, message: 'Cannot re-index non-system documents via this endpoint.' });
        }
        if (!document.fileName) {
             return res.status(400).json({ success: false, message: 'Document record is missing the required filename.' });
        }

        await UserDocument.findByIdAndUpdate(documentId, { status: 'reindexing', errorMessage: null });
        console.log(`[Admin Reindex] Document ${documentId} status set to 'reindexing'.`);

        // 2. Construct File Path
        // Use fileName (unique name) for system docs stored directly in KNOWLEDGE_BASE_DIR
        const filePath = path.join(KNOWLEDGE_BASE_DIR, document.fileName); 
        console.log(`[Admin Reindex] Constructed file path: ${filePath}`);

        // Check if file exists before processing
        try {
            await fsPromises.access(filePath, fs.constants.R_OK);
            console.log(`[Admin Reindex] File exists and is readable: ${filePath}`);
        } catch (accessError) {
             console.error(`[Admin Reindex] File not found or not accessible at path: ${filePath}`, accessError);
             await UserDocument.findByIdAndUpdate(documentId, { status: 'failed', errorMessage: 'File not found on server.' });
             return res.status(404).json({ success: false, message: `Document file '${document.originalFileName}' not found on the server.` });
        }


        // 3. Delete Existing Vectors from Pinecone
        console.log(`[Admin Reindex] Attempting to delete existing vectors for document ${documentId}...`);
        try {
            const filter = { documentId: documentId };
            await deleteVectorsByFilter(filter);
            console.log(`[Admin Reindex] Successfully deleted vectors with filter: ${JSON.stringify(filter)}`);
        } catch (deleteError) {
            console.error(`[Admin Reindex] Error deleting existing vectors for document ${documentId}:`, deleteError);
            // Decide if this is fatal. Maybe vectors didn't exist? Log and continue for now.
            // Consider adding a specific check/response if deletion *must* succeed before proceeding.
            console.warn(`[Admin Reindex] Could not delete existing vectors (may not exist). Proceeding with upsert.`);
        }


        // 4. Re-Process and Embed Document
        console.log(`[Admin Reindex] Processing and embedding document: ${document.originalFileName} (${documentId})`);
        // Reuse the utility function
        const { chunks, embeddings, totalChunks } = await processAndEmbedDocument(
            filePath,
            document.originalFileName || document.fileName // Use original name for logging if available
        );
       
        if (totalChunks === 0 || embeddings.length === 0) {
            console.warn(`[Admin Reindex] Processing resulted in zero chunks or embeddings for ${documentId}.`);
            await UserDocument.findByIdAndUpdate(documentId, { status: 'failed', errorMessage: 'Document processing yielded no content.' });
            return res.status(400).json({ success: false, message: 'Document processing yielded no content to index.' });
        }
        console.log(`[Admin Reindex] Processed ${totalChunks} chunks with embeddings for ${documentId}.`);


        // 5. Prepare New Vectors for Pinecone
        const vectors: PineconeVector[] = chunks.map((chunk, index) => {
            // --- START: Chunk Text Logging ---
            const chunkText = chunk.text;
            const chunkIndex = index;
            console.log(`\n[Reindex Chunk Debug] DocID: ${documentId}, Chunk ${chunkIndex}:`);
            console.log(`--- START CHUNK TEXT (Size: ${chunkText.length}) ---`);
            console.log(chunkText);
            console.log(`--- END CHUNK TEXT ---\n`);
            // --- END: Chunk Text Logging ---

            return {
                id: `${documentId}_chunk_${chunkIndex}`, // Maintain consistent ID format
                values: embeddings[index],
                metadata: {
                    documentId: documentId,
                    originalFileName: document!.originalFileName, // Use ! because we checked non-null earlier
                    chunkIndex: chunkIndex, // Use the defined index variable
                    text: chunkText, // Use the defined text variable
                    sourceType: 'system'
                }
            };
        });
        console.log(`[Admin Reindex] Prepared ${vectors.length} vectors for upsert.`);


        // 6. Upsert New Vectors to Pinecone
        console.log(`[Admin Reindex] Upserting ${vectors.length} new vectors for document ${documentId}...`);
        await upsertVectors(vectors);
        console.log(`[Admin Reindex] Successfully upserted new vectors for document ${documentId}.`);


        // 7. Update Document Status in MongoDB
        await UserDocument.findByIdAndUpdate(documentId, {
            status: 'completed',
            totalChunks: totalChunks, // Update chunk count in case it changed
            uploadTimestamp: new Date() // Update timestamp to reflect re-indexing time
        });
        console.log(`[Admin Reindex] Updated document ${documentId} status to 'completed' and refreshed metadata.`);

        return res.status(200).json({
            success: true,
            message: `Document '${document.originalFileName}' re-indexed successfully.`,
            documentId: documentId,
            chunksProcessed: totalChunks
        });

    } catch (error: any) {
        console.error(`[Admin Reindex] Critical error during re-indexing document ${documentId}:`, error);
        // Ensure status is marked as failed if an error occurs after setting 'reindexing'
        if (documentId && document && document.status !== 'failed') {
             await UserDocument.findByIdAndUpdate(documentId, { 
                 status: 'failed', 
                 errorMessage: `Re-indexing failed: ${error.message || String(error)}` 
             }).catch(err => console.error("[Admin Reindex] Error updating document status to failed during error handling:", err));
        }
        return res.status(500).json({
            success: false,
            message: `Failed to re-index document '${document?.originalFileName || documentId}'.`,
            error: error.message || String(error)
        });
    }
});

// ================================================
//          USER MANAGEMENT ROUTES
// ================================================

// --- GET List All Users (Admin) ---
/**
 * @route   GET /api/admin/users
 * @desc    Get a list of all users (excluding passwords)
 * @access  Private (Admin only)
 */
router.get('/users', async (req: Request, res: Response) => {
    console.log('[Admin Users] Request received for listing users.');
    try {
        const users = await User.find({}).select('-password');
        console.log(`[Admin Users] Found ${users.length} users.`);
        res.status(200).json({ success: true, users: users });
    } catch (error: any) {
        console.error('[Admin Users] Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user list.',
            error: error.message || String(error)
        });
    }
});

// --- DELETE User (Admin) ---
/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user account
 * @access  Private (Admin only)
 */
router.delete('/users/:userId', protect, checkSession, isAdmin, async (req: Request, res: Response) => {
    const userIdToDelete = req.params.userId;
    const adminUserId = req.user?._id;

    console.log(`[Admin Users] Request to delete user ${userIdToDelete} by admin ${adminUserId}`);

    // Basic validation
    if (!mongoose.Types.ObjectId.isValid(userIdToDelete)) {
        return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
    }
    if (adminUserId && adminUserId.toString() === userIdToDelete) {
        return res.status(400).json({ success: false, message: 'Admin cannot delete their own account.' });
    }

    try {
        const result = await User.deleteOne({ _id: userIdToDelete });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        console.log(`[Admin Users] User ${userIdToDelete} deleted successfully.`);
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error: any) {
        console.error(`[Admin Users] Error deleting user ${userIdToDelete}:`, error);
        res.status(500).json({ success: false, message: 'Error deleting user.', error: error.message });
    }
});

// --- PUT Change User Password (Admin) ---
/**
 * @route   PUT /api/admin/users/:userId/password
 * @desc    Change a specific user's password
 * @access  Private (Admin only)
 */
router.put('/users/:userId/password', protect, checkSession, isAdmin, async (req: Request, res: Response) => {
    const userIdToUpdate = req.params.userId;
    const { newPassword } = req.body;
    
    console.log(`[Admin Users] Request to change password for user ${userIdToUpdate}`);

    // Basic validation
    if (!mongoose.Types.ObjectId.isValid(userIdToUpdate)) {
        return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    try {
        const user = await User.findById(userIdToUpdate);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        user.password = await bcrypt.hash(newPassword, 10); // Hashing cost factor: 10
        await user.save();
        console.log(`[Admin Users] Password updated for user ${userIdToUpdate}`);
        res.status(200).json({ success: true, message: 'User password updated successfully.' });
    } catch (error: any) {
        console.error(`[Admin Users] Error updating password for user ${userIdToUpdate}:`, error);
        res.status(500).json({ success: false, message: 'Error updating user password.', error: error.message });
    }
});

// --- POST Create User (Admin) --- Needs implementation or use controller if exists
// Ensure this uses an inline handler or a CORRECTLY imported controller
router.post('/users', async (req, res) => {
    // Example: Logic for creating a user
    res.status(501).json({ message: "Create user endpoint not fully implemented" });
});

// --- PUT Update User Role (Admin) --- Needs implementation or use controller if exists
router.put('/users/:userId/role', async (req, res) => {
    // Example: Logic for updating user role
    res.status(501).json({ message: "Update user role endpoint not fully implemented" });
});

// --- GET User By ID (Admin) --- Needs implementation or use controller if exists
router.get('/users/:userId', async (req, res) => {
    // Example: Logic for getting user by ID
    res.status(501).json({ message: "Get user by ID endpoint not fully implemented" });
});

// --- NEW ROUTE: Delete All System KB Documents ---
router.delete('/system-kb/all', protect, isAdmin, async (req: Request, res: Response) => {
    const adminUserId = req.user?._id;
    const adminUsername = req.user?.username;

    console.log(`[Admin Delete All System KB] Request received from admin: ${adminUsername} (ID: ${adminUserId})`);

    let deletedDbCount = 0;
    let attemptedFileDeletions = 0;
    let successfulFileDeletions = 0;
    let failedFileDeletions: string[] = [];

    try {
        // 1. Find all system document metadata to get filenames
        const documentsToDelete = await UserDocument.find({
            sourceType: 'system' // Filter for system documents
        }).select('fileName');

        const fileNamesToDelete = documentsToDelete.map(doc => doc.fileName).filter(Boolean);
        attemptedFileDeletions = fileNamesToDelete.length;
        console.log(`[Admin Delete All System KB] Found ${documentsToDelete.length} system records and ${attemptedFileDeletions} filenames.`);

        if (documentsToDelete.length === 0) {
            return res.status(200).json({ success: true, message: 'No system documents found to delete.', deletedDbCount: 0, attemptedFileDeletions: 0 });
        }

        // 2. Delete DB records
        console.log(`[Admin Delete All System KB] Deleting ${documentsToDelete.length} records from MongoDB...`);
        const dbResult = await UserDocument.deleteMany({
            sourceType: 'system'
        });
        deletedDbCount = dbResult.deletedCount;
        console.log(`[Admin Delete All System KB] Successfully deleted ${deletedDbCount} system records from MongoDB.`);

        // 3. Delete Pinecone vectors (fire-and-forget style with error logging)
        console.log(`[Admin Delete All System KB] Initiating Pinecone vector deletion for sourceType: system...`);
        deleteVectorsByFilter({ sourceType: 'system' })
            .then(() => {
                console.log(`[Admin Delete All System KB] Pinecone vector deletion successfully initiated for sourceType: system.`);
            })
            .catch(pineconeError => {
                console.error(`[Admin Delete All System KB] Error initiating Pinecone vector deletion for sourceType: system:`, pineconeError);
            });

        // 4. Delete physical files
        console.log(`[Admin Delete All System KB] Attempting to delete ${attemptedFileDeletions} physical files from ${KNOWLEDGE_BASE_DIR}...`);
        for (const fileName of fileNamesToDelete) {
            const filePath = path.join(KNOWLEDGE_BASE_DIR, fileName);
            try {
                await fsPromises.unlink(filePath);
                console.log(`[Admin Delete All System KB] Successfully deleted file: ${filePath}`);
                successfulFileDeletions++;
            } catch (fileError: any) {
                if (fileError.code === 'ENOENT') {
                    console.warn(`[Admin Delete All System KB] File not found (possibly already deleted): ${filePath}`);
                } else {
                    console.error(`[Admin Delete All System KB] Failed to delete file ${filePath}:`, fileError);
                    failedFileDeletions.push(fileName);
                }
            }
        }
        console.log(`[Admin Delete All System KB] File deletion summary: ${successfulFileDeletions} succeeded, ${failedFileDeletions.length} failed.`);

        // 5. Return success response
        return res.status(200).json({
            success: true,
            message: `Deleted ${deletedDbCount} system document records. Attempted deletion of ${attemptedFileDeletions} files (${successfulFileDeletions} successful). Check server logs for details.`,
            deletedDbCount,
            attemptedFileDeletions,
            successfulFileDeletions,
            failedFileDeletions: failedFileDeletions.length > 0 ? failedFileDeletions : undefined
        });

    } catch (error: any) {
        console.error(`[Admin Delete All System KB] Critical error during deletion requested by admin ${adminUsername} (ID: ${adminUserId}):`, error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting system documents.',
            error: error.message || String(error)
        });
    }
});

// --- GET All User Usage Data ---
router.get('/usage', async (req: Request, res: Response): Promise<void | Response> => {
    console.log(`[Admin Usage] Request received to fetch usage for all users.`);
    try {
        const usersUsage = await User.find({}) // Find all users
            .select('username role usageMonthMarker currentMonthPromptTokens currentMonthCompletionTokens currentMonthCost')
            .lean(); // Use lean for performance

        // Optional: Add totalTokens to each user object
        const formattedUsage = usersUsage.map(u => ({
            ...u,
            totalTokens: (u.currentMonthPromptTokens || 0) + (u.currentMonthCompletionTokens || 0)
        }));

        console.log(`[Admin Usage] Found usage data for ${formattedUsage.length} users.`);
        res.status(200).json({ success: true, usersUsage: formattedUsage });

    } catch (error) {
        console.error('[Admin Usage] Error fetching all users usage:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch user usage data.', 
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router; 