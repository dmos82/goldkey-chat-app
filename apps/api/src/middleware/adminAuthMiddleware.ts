import { Request, Response, NextFunction } from 'express';
import { protect } from './authMiddleware'; // Assuming protect adds user to req

/**
 * Middleware to ensure the user is authenticated and has the 'admin' role.
 */
export const adminProtect = (req: Request, res: Response, next: NextFunction) => {
  // First, ensure the user is authenticated using the standard protect middleware
  protect(req, res, (err?: any) => {
    if (err) {
      // If protect middleware returned an error (e.g., no token, invalid token)
      // Forward the error or handle it (often handled by protect itself sending response)
      // If protect sends a response, this part might not even be reached.
      console.error('[Admin Protect] Error from underlying protect middleware:', err);
      // We assume protect middleware handles sending the 401 response.
      // If not, uncomment the line below:
      // return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
      return; // Stop processing if protect failed
    }

    // If protect passed, req.user should be populated.
    // Now, check for the admin role.
    if (req.user && req.user.role === 'admin') {
      // User is authenticated and is an admin, proceed to the next middleware/route handler
      next();
    } else {
      // User is authenticated but not an admin
      console.warn(`[Admin Protect] Forbidden: User ${req.user?.userId || 'unknown'} with role ${req.user?.role || 'unknown'} attempted admin access.`);
      res.status(403).json({ success: false, message: 'Forbidden: Administrator access required.' });
    }
  });
}; 