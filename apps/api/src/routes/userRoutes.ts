import express, { Request, Response, Router } from 'express';
import { protect, checkSession } from '../middleware/authMiddleware';
import User from '../models/UserModel'; // Import User model

const router: Router = express.Router();

// Apply protect and checkSession middleware to subsequent routes if needed globally
// For specific protection, apply directly to the route
// router.use(protect, checkSession);

// GET /api/users/me/usage - Fetch usage data for the logged-in user
router.get('/me/usage', protect, checkSession, async (req: Request, res: Response): Promise<void | Response> => {
    const userId = req.user?._id;

    if (!userId) {
        // Should be caught by protect middleware, but double-check
        return res.status(401).json({ success: false, message: 'Authentication error: User ID not found.' });
    }

    console.log(`[User Usage] Fetching usage data for user: ${userId}`);

    try {
        const user = await User.findById(userId)
            .select('usageMonthMarker currentMonthPromptTokens currentMonthCompletionTokens currentMonthCost') // Select only usage fields
            .lean(); // Use lean() for performance as we don't need Mongoose document methods

        if (!user) {
            console.log(`[User Usage] User not found: ${userId}`);
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const promptTokens = user.currentMonthPromptTokens || 0;
        const completionTokens = user.currentMonthCompletionTokens || 0;

        console.log(`[User Usage] Successfully fetched usage data for user: ${userId}`);
        return res.status(200).json({
            success: true,
            usageMonthMarker: user.usageMonthMarker || null,
            promptTokens: promptTokens,
            completionTokens: completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatedCost: user.currentMonthCost || 0
        });

    } catch (error) {
        console.error(`[User Usage] Error fetching usage data for user ${userId}:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching user usage data.',
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router; 