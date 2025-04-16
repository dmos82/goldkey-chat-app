// Basic index file for types

// (Removed incorrect backend import)

// Define the Document type here later
export interface Document {
  _id: string;
  originalFileName: string;
  fileSize: number;
  uploadTimestamp: string;
  sourceType: 'user' | 'system'; // Added sourceType
  // Add other relevant fields as needed
}

// Frontend representation of a message
export interface Message {
  _id?: string; // Added optional _id for list keys
  sender: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  timestamp?: string; // Added optional timestamp
}

// Frontend representation of a source
// Derived from backend IChatMessage sources and queryCollection results
export interface Source {
  source: string; // originalFileName
  pageNumbers?: number[];
  documentId: string | null; // MongoDB ID (user) or string ID (system)
  type: 'user' | 'system';
  text?: string; // Optional chunk text
}

// Simplified Chat Summary type for the list
export interface ChatSummary {
  _id: string;
  chatName: string;
  updatedAt: string; 
  createdAt: string;
}

// Re-define IChatMessage structure for frontend use
// We avoid direct import from backend to keep concerns separate
export interface FrontendChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: {
    documentId: string | null;
    fileName: string;
    pageNumbers?: number[];
    type: 'user' | 'system';
  }[];
  timestamp: string; // Store as string or Date
}

// Representing the full chat detail structure for the frontend
export interface ChatDetail {
  _id: string;
  userId: string; // Assuming string representation of ObjectId
  chatName: string;
  createdAt: string;
  updatedAt: string;
  messages: FrontendChatMessage[];
}

// Export other types from this directory if needed 