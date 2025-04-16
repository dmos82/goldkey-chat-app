import mongoose, { Schema, Document } from 'mongoose';

// Define the interface for the User document
export interface IUser extends Document {
  username: string;
  password: string; // Storing the hash
  createdAt: Date;
  role: string;
  activeSessionId?: string; // Added: Tracks the active session ID
}

// Define the Mongoose schema
const UserSchema: Schema = new Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true, // Ensure efficient lookups by username
    trim: true, // Remove leading/trailing whitespace
  },
  password: { 
    type: String, 
    required: true, 
  },
  createdAt: { 
    type: Date, 
    default: Date.now, // Automatically set the creation date
  },
  role: {
    type: String,
    required: true,
    enum: ['user', 'admin'],
    default: 'user',
  },
  activeSessionId: { // Added: Tracks the active session ID
    type: String,
    required: false,
    default: null,
    index: true, // Might be useful for quickly finding users by session ID, though unlikely
  },
}, { timestamps: true });

// Create and export the User model
// Mongoose will automatically create a collection named 'users' (pluralized, lowercase)
const User = mongoose.model<IUser>('User', UserSchema);

export default User; 