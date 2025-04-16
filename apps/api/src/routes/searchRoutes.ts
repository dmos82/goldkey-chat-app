import express, { Request, Response, Router } from 'express';
import { UserDocument } from '../models/UserDocument';
import { protect, checkSession } from '../middleware/authMiddleware'; // Import checkSession
import mongoose from 'mongoose';

const router: Router = express.Router();

/**
 * @route   GET /api/search/filename
 * @desc    Search documents by filename using text index
 * @access  Private
 * @param   {string} q - The search query string for the filename
 */
router.get('/filename', protect, checkSession, async (req: Request, res: Response): Promise<void | Response> => {
  const searchQuery = req.query.q as string;

  if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim() === '') {
    return res.status(400).json({ success: false, message: 'Search query parameter \'q\' is required.' });
  }

  // Added user check after protect/checkSession
  if (!req.user?._id) {
    return res.status(401).json({ success: false, message: 'User not authenticated properly.' });
  }

  try {
    // Ensure the text index exists (should be done via schema definition)
    // Example: UserDocumentSchema.index({ originalFileName: 'text' });

    console.log(`[FilenameSearch] User ${req.user._id} searching for: "${searchQuery}"`);

    const documents = await UserDocument.find(
      {
        // Search only documents belonging to the authenticated user
        userId: req.user._id, 
        $text: { $search: searchQuery }
      },
      { score: { $meta: 'textScore' } } // Project relevance score
    )
      .select('originalFileName _id uploadTimestamp') // Select only necessary fields
      .sort({ score: { $meta: 'textScore' } }) // Sort by relevance
      .limit(20) // Limit results
      .lean(); // Use lean for performance if full Mongoose documents aren't needed

    console.log(`[FilenameSearch] Found ${documents.length} results for user ${req.user._id}`);
    res.status(200).json({ success: true, results: documents });
    return; // Explicitly return after sending success response

  } catch (error) {
    console.error('[FilenameSearch] Error during filename search:', error);
    if (error instanceof mongoose.Error) {
        // Handle specific Mongoose errors if necessary
        return res.status(500).json({ success: false, message: 'Database error during search.' });
    } else if (error instanceof Error) {
         // Handle cases like index not existing, though Mongoose might not throw distinctly for this specific case easily.
         // A common error string for missing text index is "text index required for $text query"
        if (error.message.includes('text index required')) {
             console.error("Text index on 'originalFileName' might be missing in UserDocument schema.");
             return res.status(500).json({ success: false, message: 'Search configuration error. Text index might be missing.' });
        }
        return res.status(500).json({ success: false, message: 'Internal server error during search.' });
    } else {
        return res.status(500).json({ success: false, message: 'An unknown error occurred during search.' });
    }
  }
});

export default router; 