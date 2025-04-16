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
// Assuming dist/routes/systemKbRoutes.js
// CORRECTED: Go up four levels to reach project root
// const KNOWLEDGE_BASE_DIR = path.resolve(__dirname, '../../../../knowledge_base_docs'); // REMOVED - Path comes from DB now
// console.log(`[SystemKB Route Init] KNOWLEDGE_BASE_DIR resolved to: ${KNOWLEDGE_BASE_DIR}`); // Debug log removed

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
router.get('/download/:id', protect, async (req: Request, res: Response): Promise<void | Response> => {
    const { id } = req.params;
    console.log(`[SystemKB Download] Request for system document ID: ${id}`); // Added log

    if (!req.user) {
        console.error('[SystemKB Serve] User context missing after protect middleware.');
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
        console.error(`[SystemKB Serve] Invalid document ID format: ${id}`);
        return res.status(400).json({ success: false, message: 'Invalid document ID format.' });
    }
    const documentId = new mongoose.Types.ObjectId(id);
    // console.log(`[SystemKB Serve] Valid document ID: ${documentId}`); // Debug log removed

    try {
        // 1. Find the document metadata, including sourcePath
        const document = await UserDocument.findOne({
            _id: documentId,
            sourceType: 'system'
        })
        // Select required fields including sourcePath
        .select('_id originalFileName mimeType sourcePath')
        .lean<IUserDocument>(); // Use lean with explicit type

        if (!document) {
            console.warn(`[SystemKB Serve] System document not found in MongoDB for ID: ${id}`);
            return res.status(404).json({ success: false, message: 'System document not found.' });
        }

        // 2. Get the full path directly from the document's sourcePath field
        const filePath = document.sourcePath;
        if (!filePath) {
             console.error(`[SystemKB Serve Error] Document ${id} found in DB but is missing the required 'sourcePath' field.`);
             return res.status(422).json({ 
                 success: false, 
                 message: 'Cannot process document: File path information is missing from the document record.' 
             });
        }
        // console.log(`[SystemKB Serve File Path]: ${filePath}`); // Debug log removed

        // 3. Check if the file exists at the stored path
        try {
            await fs.access(filePath);
            // console.log(`[SystemKB Serve FS Check]: File access confirmed for ${filePath}`); // Debug log removed
        } catch (accessError) {
            console.error(`[SystemKB Serve FS Check Error]: Physical file not found on disk for document ${id}: ${filePath}`, accessError);
            return res.status(404).json({ success: false, message: 'System document file not found on server.' });
        }

        // 4. Set headers and send the file
        const contentType = document.mimeType || (document.originalFileName.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);

        // console.log(`[SystemKB Serve] Attempting to send file: ${filePath}`); // Debug log removed
        return res.sendFile(filePath);

    } catch (error) {
        console.error(`[SystemKB Serve] Error serving system document ${id}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error serving system document.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router; 