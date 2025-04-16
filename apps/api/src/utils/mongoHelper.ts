import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in environment variables.');
  process.exit(1); // Exit if DB connection string is missing
}

/**
 * Connects to the MongoDB database.
 */
export const connectDB = async () => {
  try {
    const options = {
      dbName: 'gkchatty', // Specify the database name here
    };
    
    console.log('Attempting to connect to MongoDB with URI:', MONGODB_URI.substring(0, 20) + '...');
    await mongoose.connect(MONGODB_URI, options);
    console.log('✅ MongoDB Connected successfully.');

    mongoose.connection.on('error', (err) => {
       console.error('MongoDB connection error after initial connection:', err);
    });
    mongoose.connection.on('disconnected', () => {
       console.log('MongoDB disconnected.');
    });

  } catch (err: any) {
    console.error('❌❌❌ MongoDB initial connection FAILED. Full error:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    
    try {
      console.error('Full error object:', JSON.stringify(err, null, 2));
    } catch (jsonErr) {
      console.error('Error could not be stringified:', err);
    }
    
    console.error('Error stack:', err.stack);
    
    // process.exit(1); // <-- COMMENT OUT or REMOVE this line
    throw err; // Re-throw the error so the calling code (IIFE in index.ts) can potentially see it
  }
};

/**
 * Disconnects from the MongoDB database.
 */
export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected successfully.');
  } catch (err) {
    console.error('❌ Error disconnecting from MongoDB:', err);
    // Decide if we should throw, exit, or just log
    // throw err; // Optional: re-throw if disconnection failure is critical
  }
};

// Define Schemas (We will add these in the next step)
// Placeholder for SystemDocument schema
// Placeholder for UserDocument schema

// Export models (We will add these later)
// export const SystemDocument = mongoose.model('SystemDocument', systemDocumentSchema);
// export const UserDocument = mongoose.model('UserDocument', userDocumentSchema);

// Optional: Export helper functions for CRUD operations later 