import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IUser } from '../models/UserModel'; // Keep only IUser if needed, or remove entirely if not
import User from '../models/UserModel'; // Ensure User model is imported

// Define the structure of the decoded JWT payload
interface DecodedUserPayload extends jwt.JwtPayload { // Extend jwt.JwtPayload to include standard claims like jti
  userId: string;
  username: string;
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  role?: 'user' | 'admin'; // Added optional role
  jti?: string; // JWT ID claim
}

// --- Augment Express Request type --- 
// This uses declaration merging to add a 'user' property to the Request object.
// It's best practice to put this in a dedicated types file (e.g., types/express/index.d.ts)
// but including it here for simplicity for now.
declare global {
  namespace Express {
    interface Request {
      user?: (IUser & { _id: any }) | DecodedUserPayload | null; // Allow for Mongoose doc, payload, or null
    }
  }
}
// ------------------------------------

/**
 * Express middleware to protect routes by verifying JWT.
 * Extracts token from 'Authorization: Bearer <token>' header.
 * Verifies token and attaches user info (initially decoded payload, potentially full user) to req.user.
 */
export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;

  // Log headers and check for token
  console.log('[Protect Middleware] Headers:', JSON.stringify(req.headers)); // Log headers
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
    console.log('[Protect Middleware] Token found in header:', token ? `${token.substring(0, 15)}...` : 'NONE');
  } else {
    console.log('[Protect Middleware] No Bearer token found in auth header.');
  }

  if (!token) {
    console.log('[Protect Middleware] REJECTING: No token provided.');
    // Ensure status is 401 for consistency
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    // Verify token
    console.log('[Protect Middleware] Verifying token...');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[Protect Middleware] FATAL ERROR: JWT_SECRET is not defined for verification.');
      return res.status(500).json({ message: 'Server configuration error' }); // Keep 500 for config issue
    }

    // Type assertion is okay here since jwt.verify throws on failure
    const decoded = jwt.verify(token, jwtSecret) as DecodedUserPayload;
    console.log('[Protect Middleware] Token VERIFIED. Decoded payload:', JSON.stringify(decoded));

    // ---> ADD LOG BEFORE DB CALL <--- 
    console.log(`[Protect Middleware] Attempting to find user by ID: ${decoded.userId}`);

    // Get user from the token ID and attach to request
    // Select '-password' to exclude password hash from being attached to req.user
    const userFromDb = await User.findById(decoded.userId).select('-password');

    // ---> ADD LOG AFTER DB CALL (Check if user exists) <--- 
    if (!userFromDb) {
       console.log(`[Protect Middleware] REJECTING: User with ID ${decoded.userId} not found in DB.`);
       // Use 401 as the user identified by the token doesn't exist
       return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    console.log('[Protect Middleware] User found in DB. Attaching to req.user...');

    req.user = userFromDb; // Attach the full user document (minus password)

    // ---> ADD DISTINCT LOG BEFORE next() <--- 
    console.log('[Protect Middleware] User attached. Preparing to call next().');
    console.log('[Protect Middleware] Calling next()...');
    next(); // Proceed to the next middleware/route handler

  } catch (error: any) {
    // Log specific JWT errors
    console.error('[Protect Middleware] REJECTING: Token verification failed.', error.message);
    // Use 401 for any token validation failure
    res.status(401).json({ message: 'Not authorized, token failed', error: error.message }); // Optionally include error message
  }
}; 

/**
 * Middleware to check if the authenticated user has the 'admin' role.
 * Must be used AFTER the 'protect' middleware.
 */
export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check req.user exists and has role property with value 'admin'
    // Need type assertion or check because req.user might be DecodedUserPayload if DB fetch fails (though protect should handle that)
    const user = req.user as (IUser & { _id: any }) | null | undefined;

    if (user && user.role === 'admin') {
      console.log(`[isAdmin Middleware] Access GRANTED for admin user ${user.username} (ID: ${user._id}) to ${req.originalUrl}`);
      next(); // User is admin, proceed
    } else {
      console.warn(`[isAdmin Middleware] Access DENIED: User ${user?._id || 'unknown'} with role ${user?.role || 'none'} tried to access admin route ${req.originalUrl}`);
      res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
  } catch (error) {
    console.error("[isAdmin Middleware] Error:", error);
    res.status(500).json({ message: 'Internal server error during admin authorization check' });
  }
}; 

/**
 * Middleware to check if the current JWT's ID (jti) matches the user's activeSessionId.
 * Must be used AFTER the 'protect' middleware, which attaches the user document to req.user
 * and verifies the token initially.
 */
export const checkSession = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  console.log('[checkSession Middleware] Running session check...');

  // 1. Ensure user is attached by 'protect' middleware
  // We need the full user document here, not just the decoded payload.
  // Type assertion is needed because req.user can be DecodedUserPayload or null.
  const userFromDb = req.user as (IUser & { _id: any }) | null | undefined;

  if (!userFromDb) {
    console.error('[checkSession Middleware] REJECTING: No user object found on request. \'protect\' middleware might have failed or wasn\'t used.');
    // Use 401 as this indicates an authentication issue (missing user context)
    return res.status(401).json({ message: 'Not authorized, user context missing.' });
  }

  // 2. Extract JWT ID (jti) from the verified token (should still be accessible if needed, 
  //    but ideally we rely on protect having verified it. Re-decoding is inefficient.
  //    Let's assume the token is available or re-verify if necessary, but it's better to
  //    pass the jti through or trust 'protect'. For now, let's re-verify for robustness, 
  //    acknowledging the performance cost.

  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    // This case should technically be caught by 'protect', but defensively check again.
    console.warn('[checkSession Middleware] REJECTING: No token found, although protect should have caught this.');
    return res.status(401).json({ message: 'Not authorized, no token.' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[checkSession Middleware] FATAL ERROR: JWT_SECRET is not defined.');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: false }) as DecodedUserPayload;
    const jti = decoded.jti;

    // 3. Compare JWT ID (jti) with user's activeSessionId
    console.log(`[checkSession Middleware] Comparing Token JTI: ${jti} with DB activeSessionId: ${userFromDb.activeSessionId}`);

    if (!jti) {
      console.warn('[checkSession Middleware] REJECTING: Token is missing JWT ID (jti) claim.');
      return res.status(401).json({ message: 'Not authorized, invalid session token (missing jti).' });
    }

    if (!userFromDb.activeSessionId) {
      console.warn(`[checkSession Middleware] REJECTING: User ${userFromDb.username} has no active session ID in DB.`);
      // This could mean the user logged out, but the token is still valid. Reject.
      return res.status(401).json({ message: 'Not authorized, session not active or expired.' });
    }

    if (jti !== userFromDb.activeSessionId) {
      console.warn(`[checkSession Middleware] REJECTING: Token JTI (${jti}) does not match active DB session ID (${userFromDb.activeSessionId}) for user ${userFromDb.username}.`);
      // This indicates the token belongs to an older session.
      return res.status(401).json({ message: 'Not authorized, session expired or invalidated.', code: 'INVALID_SESSION' });
    }

    // 4. Session is valid, proceed
    console.log(`[checkSession Middleware] Session check PASSED for user ${userFromDb.username}. JTI matches activeSessionId.`);
    next();

  } catch (error: any) {
    // Handle potential errors during token re-verification (e.g., expired token if ignoreExpiration wasn't true)
    console.error('[checkSession Middleware] REJECTING: Error during token verification or session check:', error.message);
    // Use 401 for any failure during this check
    res.status(401).json({ message: 'Not authorized, session check failed.', error: error.message });
  }
}; 