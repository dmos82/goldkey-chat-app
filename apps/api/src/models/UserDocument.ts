import mongoose, { Document, Schema, Types } from 'mongoose';

// Interface defining the structure of a UserDocument
export interface IUserDocument extends Document {
    fileName: string;      // UUID-based filename stored on disk
    originalFileName: string;  // Original user-provided filename
    uploadTimestamp: Date;
    mimeType: string;
    totalChunks: number;
    chromaIds: string[];  // Store ChromaDB chunk IDs for reference
    fileSize: number;     // In bytes
    sourceType: 'system' | 'user'; // Added: Distinguishes document source
    userId: Types.ObjectId | null; // Added: Links to uploader (null for system)
    sourcePath: string | null; // Permanent path to the stored file
    status?: 'processing' | 'completed' | 'failed'; // Added: Track processing state
    processingErrors?: string[]; // Added: Store any errors during processing
}

const userDocumentSchema = new Schema<IUserDocument>({
  fileName: { 
    type: String, 
    required: true,
    index: true 
  },
  originalFileName: {
    type: String,
    required: true,
    text: true
  },
  uploadTimestamp: { 
    type: Date, 
    default: Date.now,
    required: true 
  },
  mimeType: { 
    type: String, 
    required: true 
  },
  totalChunks: { 
    type: Number, 
    required: true 
  },
  chromaIds: [{ 
    type: String, 
    required: true 
  }],
  fileSize: { 
    type: Number, 
    required: true 
  },
  sourceType: {
    type: String,
    enum: ['system', 'user'],
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  sourcePath: { type: String, required: false, default: null },
  status: { 
    type: String, 
    enum: ['processing', 'completed', 'failed'], 
    default: 'processing' 
  },
  processingErrors: { type: [String], default: [] }
});

// Explicitly create the text index using schema methods
// (Alternative or complementary to inline `text: true`)
// userDocumentSchema.index({ originalFileName: 'text' });

// Add any helpful instance methods here if needed
userDocumentSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;  // Remove version key from responses
  return obj;
};

// Indexing recommendations
// Index for finding user's documents
userDocumentSchema.index({ userId: 1, sourceType: 1 });

export const UserDocument = mongoose.model<IUserDocument>('UserDocument', userDocumentSchema); 