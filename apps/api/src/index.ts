import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './utils/mongoHelper';
import documentRoutes from './routes/documentRoutes'; // <-- Ensure this is uncommented
import chatRoutes from './routes/chatRoutes';
import authRoutes from './routes/authRoutes'; // <-- Import auth routes
import searchRoutes from './routes/searchRoutes'; // Import search routes
import systemKbRoutes from './routes/systemKbRoutes'; // Added: Import system KB routes
import adminRoutes from './routes/adminRoutes'; // <-- Import admin routes

// --- Main Application Setup ---
const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function startServer() {
  try {
    console.log('Starting server initialization...');
    console.log('Attempting database connection...');
    await connectDB();
    console.log('Database connection successful, proceeding with app setup...');

    // Core Middleware
    // const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'; // Old single origin approach
    // console.log(`[CORS] Allowing origin: ${frontendUrl}`); 
    // app.use(cors({ origin: frontendUrl })); 

    // Updated CORS Configuration
    const allowedOrigins = [
      'http://localhost:3000', // Local dev frontend
      'https://goldkey-chat-demo-cli.netlify.app' // Deployed Netlify frontend
      // Add other allowed origins if needed in the future
    ];
    console.log(`[CORS] Allowed Origins: ${allowedOrigins.join(', ')}`);

    const corsOptions = {
      origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // Allow requests from allowed list
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          console.error(`[CORS] Blocked origin: ${origin}`);
          const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
          callback(new Error(msg), false);
        }
      },
      credentials: true, // Allow cookies/auth headers
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Standard methods
      allowedHeaders: ['Content-Type', 'Authorization'], // Allow common headers
    };

    app.use(cors(corsOptions)); // Apply updated CORS options

    // Explicitly handle OPTIONS requests (preflight) for all routes
    // This should ideally be handled by the cors middleware, but adding explicitly 
    // can sometimes resolve issues with specific hosting/proxy setups.
    app.options('*', cors(corsOptions)); // Enable preflight across-the-board

    // Add request logging *after* CORS, *before* JSON parsing
    app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin || 'N/A';
      console.log(`[Request Logger] Incoming: ${req.method} ${req.originalUrl} from Origin: ${origin}`);
      next();
    });

    app.use(express.json()); // Parse JSON request bodies
    app.use(morgan('dev')); // Logging HTTP requests
    app.use(express.urlencoded({ extended: true })); // Body parser for URL-encoded requests

    // --- API Routes --- 
    // Health check endpoint
    app.get('/healthz', (req, res) => {
      // Optionally add checks here (e.g., DB connection status) if needed later
      res.status(200).send('OK');
    });

    // Basic ping route
    app.get('/api/ping', (_req: Request, res: Response): void => {
      res.json({ message: 'pong', timestamp: new Date().toISOString() });
    });
    
    // Mount document processing routes
    app.use('/api/documents', documentRoutes); // <-- Ensure this is uncommented

    // Mount chat routes - Reverted base path
    app.use('/api/chat', chatRoutes); // Use /api/chat as the base path

    // Mount auth routes
    app.use('/api/auth', authRoutes);

    // Mount search routes
    app.use('/api/search', searchRoutes);

    // Added: Mount system KB routes
    app.use('/api/system-kb', systemKbRoutes);

    // Added: Mount admin routes
    app.use('/api/admin', adminRoutes);

    // TODO: Add chat route here later
    // app.use('/api/chat', chatRoutes);

    // --- Error Handling ---
    // Simple 404 handler for routes not found
    app.use((_req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });

    // Global error handler (must have 4 arguments)
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Global Error Handler caught:', err);
      // Respond with a generic server error
      // Avoid leaking stack trace details in production
      res.status(err.status || 500).json({ 
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred' 
      });
    });

    // --- Start Server ---
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 API Server listening on port ${port}`);
    }).on('error', (err: Error & { code?: string }) => {
        // Handle specific listen errors like EADDRINUSE
        if (err.code === 'EADDRINUSE') {
          console.error(`Error: Port ${port} is already in use. Is another instance running?`);
        } else {
          console.error('Failed to start server:', err);
        }
        process.exit(1); // Exit if server fails to start
      });

    // --- Graceful Shutdown ---
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received. Starting graceful shutdown...');
      server.close(() => {
        console.log('Server closed. Exiting process.');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received. Starting graceful shutdown...');
      server.close(() => {
        console.log('Server closed. Exiting process.');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Server initialization failed:', error);
    process.exit(1); // Exit if critical initialization fails (e.g., DB connection)
  }
}

startServer();