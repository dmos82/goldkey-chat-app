import mongoose, { Schema, Document, Types } from 'mongoose';

// Interface for a single message within a chat
interface IChatMessage {
  role: 'user' | 'assistant'; // Changed 'ai' to 'assistant' to match OpenAI terminology
  content: string;
  sources?: { // Optional field for AI assistant messages
    documentId: string | null; // Can be MongoDB ID for user docs or filename/UUID for system
    fileName: string;
    pageNumbers?: number[];
    type: 'user' | 'system';
    text?: string; // Include original chunk text if needed for context/display
  }[];
  timestamp: Date;
}

// Interface for the Chat document
export interface IChat extends Document {
  userId: Types.ObjectId;
  chatName: string;
  createdAt: Date;
  updatedAt: Date;
  messages: IChatMessage[];
}

// Schema for ChatMessage (implicitly defined within ChatSchema)
const ChatMessageSchema: Schema = new Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  sources: { type: Array, required: false }, // Array of source objects
  timestamp: { type: Date, default: Date.now }
}, { _id: false }); // Don't generate separate _id for subdocuments unless needed

// Schema for Chat
const ChatSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  chatName: { type: String, required: true, default: 'New Chat' },
  messages: [ChatMessageSchema] // Array of messages
}, { timestamps: true }); // Automatically adds createdAt and updatedAt

const Chat = mongoose.model<IChat>('Chat', ChatSchema);

export { Chat, IChatMessage }; // Export IChatMessage if needed elsewhere, IChat is exported via Document type 