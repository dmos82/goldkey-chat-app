import express, { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid'; // Ensure this import is present
import User, { IUser } from '../models/UserModel'; // Import the User model and IUser interface
import { protect } from '../middleware/authMiddleware'; // Keep protect for logout

const router: Router = express.Router();
const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// GET /api/auth/ping (for debugging)
router.get('/ping', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Auth route ping successful!' });
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<Response | void> => {
  const { username, password } = req.body;

  // 1. Input Validation
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (!password || typeof password !== 'string' || password.trim() === '') {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const trimmedUsername = username.trim();

  try {
    // 2. Check Existing User
    const existingUser = await User.findOne({ username: trimmedUsername });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // 3. Hash Password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // 4. Create & Save User
    const userDataForSave = {
      username: trimmedUsername,
      password: hashedPassword, // Store the hashed password
    };
    console.log('[Register Debug] Prepared user data (excluding password): ', { username: userDataForSave.username });
    console.log('[Register Debug] Attempting to save new user to MongoDB...');
    
    try {
        // Use create instead of new + save for atomicity if possible
        const user = await User.create(userDataForSave);
        console.log('[Register Debug] Successfully saved user to MongoDB. User ID:', user._id);

        // 5. Success Response (Do NOT send password hash)
        res.status(201).json({ 
          message: 'User registered successfully',
          userId: user._id,
          username: user.username,
        });
    } catch (dbError: any) {
        console.error('[Register Debug] !!! FAILED to save user to MongoDB !!! Error:', dbError);
        // Send a 400 or 500 error response, not 201
        const errorMessage = dbError.code === 11000 
            ? 'Username already exists (database constraint).' 
            : (dbError.message || 'Database error during registration.');
        res.status(dbError.code === 11000 ? 409 : 500).json({ error: errorMessage });
    }

  } catch (error) {
    // This outer catch handles errors like hashing failure or findOne failure
    console.error('[Register] General Registration Error:', error); // Log the actual error server-side
    res.status(500).json({ error: 'Registration failed due to server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<Response | void> => {
  const { username, password } = req.body;
  console.log(`[Login] Attempt for user: ${username}`);

  if (!username || !password) {
    console.log('[Login] Missing username or password');
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      console.log(`[Login] User not found: ${username}`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`[Login] Invalid password for user: ${username}`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // --- Revised Logic Start ---
    const newSessionId = uuidv4();
    console.log(`[Login] Overwriting activeSessionId for user ${user.username}. New Session ID: ${newSessionId}`);

    user.activeSessionId = newSessionId;
    await user.save(); // Save the new session ID to the database
    console.log(`[Login] Successfully updated activeSessionId for user ${user.username} in DB.`);
    // --- Revised Logic End ---

    // Prepare payload for JWT
    const payload = {
      userId: user._id,
      username: user.username,
      role: user.role,
    };

    // Directly read and check JWT_SECRET before signing
    const signingSecret = process.env.JWT_SECRET;
    if (!signingSecret) {
      console.error('[Login - JWT Sign] CRITICAL: JWT_SECRET environment variable is missing!');
      return res.status(500).json({ message: 'Internal server error: Signing key not configured.' });
    }
    // Log the secret's length and last 5 chars for comparison without exposing the full secret
    console.log(`[Login - JWT Sign] Using JWT_SECRET (signing) - Length: ${signingSecret.length}, EndsWith: ${signingSecret.slice(-5)}`);

    console.log(`[Login] Generating JWT for user: ${username} with session ID: ${newSessionId}`);

    // Generate JWT with the new session ID as jwtid, using the directly read secret
    const token = jwt.sign(
      payload,
      signingSecret, // Use the directly read variable
      { 
        expiresIn: '1h', // Keep reasonable expiration
        jwtid: newSessionId, // Use the new session ID as the JWT ID (jti)
      },
    );

    console.log(`[Login] Successful login for user: ${username}`);
    res.json({
      message: 'Login successful',
      token,
      userId: user._id, 
      username: user.username,
      role: user.role,
    });

  } catch (error) {
    console.error('[Login] Server error during login:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout Route - Updated with server-side cleanup
router.post('/logout', protect, async (req, res) => {
  console.log('[Logout] Request received');

  // 1. Verify req.user is attached by 'protect' middleware
  // Type assertion is generally safe here because 'protect' middleware should 
  // either populate req.user or reject the request before this point.
  const user = req.user as (IUser & { _id: any }) | null | undefined;

  if (!user) {
    // This case implies an issue with the 'protect' middleware or unexpected flow.
    console.error('[Logout] CRITICAL: User object not found on request after protect middleware.');
    // Return 500 Internal Server Error as this shouldn't happen in normal operation.
    return res.status(500).json({ success: false, message: 'Internal server error during logout.' });
  }

  // 2. Attempt to clear the activeSessionId in the database
  try {
    console.log(`[Logout] Attempting to clear activeSessionId for user ${user.username} (ID: ${user._id}). Current ID: ${user.activeSessionId}`);
    
    // Check if there is actually a session ID to clear
    if (user.activeSessionId) {
        user.activeSessionId = undefined; // Assign undefined to clear the optional string field
        await user.save(); // Save the changes to the database
        console.log(`[Logout] Successfully cleared activeSessionId for user ${user.username}.`);
    } else {
        console.log(`[Logout] No activeSessionId found for user ${user.username}. No DB update needed.`);
    }

    // 3. Send success response regardless of DB update status (client needs confirmation)
    res.status(200).json({ success: true, message: 'Logout successful, server session state cleared if active.' });

  } catch (error) {
    console.error(`[Logout] Error clearing activeSessionId for user ${user.username}:`, error);
    // Inform the client logout was successful but server state update failed.
    // This is better than failing the logout entirely if the DB operation fails.
    res.status(500).json({ 
        success: false, // Indicate server-side issue
        message: 'Logout successful, but failed to clear server session state.', 
        error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router; 