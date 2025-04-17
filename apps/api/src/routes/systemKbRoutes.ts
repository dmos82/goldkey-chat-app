import express, { Request, Response, Router } from 'express';
import { UserDocument, IUserDocument } from '../models/UserDocument';
import { protect, checkSession } from '../middleware/authMiddleware';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs/promises';

const router: Router = express.Router();

// Apply protect and checkSession middleware to all routes in this file
router.use(protect, checkSession);

// Define the path to the knowledge base directory relative to the compiled output
// This should match the path used in adminRoutes.ts
const KNOWLEDGE_BASE_DIR = path.resolve(__dirname, '../../../../knowledge_base_docs');
console.log(`[SystemKB Routes] KNOWLEDGE_BASE_DIR resolved to: ${KNOWLEDGE_BASE_DIR}`);

/**
 * @route   GET /api/system-kb/
 * @desc    Get list of system knowledge base documents (metadata only)
 * @access  Private (Requires login)
 */
router.get('/', protect, checkSession, async (req: Request, res: Response): Promise<void | Response> => {
    console.log('[SystemKB List] Fetching System KB documents...');

    // Optional: Add check if req.user exists, though `protect` should guarantee it
    if (!req.user) {
        console.error('[SystemKB List] User context missing after protect middleware.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
        const systemDocuments = await UserDocument.find({
            sourceType: 'system'
        })
        .select('_id originalFileName uploadTimestamp') // Select fields needed for the list
        .sort({ originalFileName: 1 }) // Sort alphabetically by original filename
        .lean(); // Use lean for potentially better performance

        console.log(`[SystemKB List] Found ${systemDocuments.length} system documents.`);

        return res.status(200).json({ success: true, documents: systemDocuments });

    } catch (error) {
        console.error('[SystemKB List] Error fetching system documents:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch system knowledge base documents.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * @route   GET /api/system-kb/documents
 * @desc    Get a list of all System Knowledge Base documents (metadata only)
 * @access  Private (Requires login)
 */
router.get('/documents', async (req: Request, res: Response): Promise<void | Response> => {
    console.log('[SystemKB List - /documents] Fetching System KB documents...');

    if (!req.user) {
        console.error('[SystemKB List - /documents] User context missing after protect/checkSession middleware.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
        const systemDocuments = await UserDocument.find({
            sourceType: 'system'
        })
        .select('_id originalFileName uploadTimestamp fileSize mimeType status') // Consistent fields
        .sort({ originalFileName: 1 })
        .lean<IUserDocument[]>(); // Use lean with type

        console.log(`[SystemKB List - /documents] Found ${systemDocuments.length} system documents.`);

        return res.status(200).json({ success: true, documents: systemDocuments });

    } catch (error) {
        console.error('[SystemKB List - /documents] Error fetching system documents:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch system knowledge base documents.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * @route   GET /api/system-kb/download/:id
 * @desc    Serve a specific System Knowledge Base document file
 * @access  Private (Requires login)
 */
router.get('/download/:id', async (req: Request, res: Response): Promise<void | Response> => {
    const { id } = req.params;
    console.log(`[SystemKB Download] Request for system document ID: ${id}`);

    if (!req.user) {
        console.error('[SystemKB Serve] User context missing after protect middleware.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
        console.error(`[SystemKB Serve] Invalid document ID format: ${id}`);
        return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }
    const documentId = new mongoose.Types.ObjectId(id);

    try {
        // 1. Find the document metadata, including the actual stored fileName
        const document = await UserDocument.findOne({
            _id: documentId,
            sourceType: 'system'
        })
        .select('_id originalFileName fileName mimeType')
        .lean<IUserDocument>();

        if (!document) {
            console.warn(`[SystemKB Download] System document metadata not found in MongoDB for ID: ${id}`);
            return res.status(404).json({ success: false, message: 'System document not found.' });
        }

        // Ensure fileName exists
        if (!document.fileName) {
             console.error(`[SystemKB Download Error] Document ${id} found in DB but is missing the required 'fileName' field.`);
             return res.status(422).json({ 
                 success: false, 
                 message: 'Cannot process document: File storage name information is missing from the document record.' 
             });
        }

        // 2. Construct the full path using the KNOWLEDGE_BASE_DIR and the stored fileName
        const filePath = path.join(KNOWLEDGE_BASE_DIR, document.fileName);
        console.log(`[SystemKB Download] Constructed file path: ${filePath}`);

        // 3. Check if the file exists at the constructed path
        try {
            await fs.access(filePath);
            console.log(`[SystemKB Download FS Check]: File access confirmed for ${filePath}`);
        } catch (accessError) {
            console.error(`[SystemKB Download FS Check Error]: Physical file not found on disk for document ${id}: ${filePath}`, accessError);
            return res.status(404).json({ success: false, message: 'System document file not found on server.' });
        }

        // 4. Set headers and send the file
        const contentType = document.mimeType || (document.originalFileName.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);

        console.log(`[SystemKB Download] Attempting to send file: ${filePath}`);
        return res.sendFile(filePath);

    } catch (error) {
        console.error(`[SystemKB Download] Error serving system document ${id}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error serving system document.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router; 