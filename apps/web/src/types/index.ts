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
  sender: 'user' | 'assistant' | 'system' | 'loading';
  text: string;
  sources?: Source[];
  timestamp?: string; // Added optional timestamp
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  cost?: number | null;
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

// Type for the response from POST /api/chat
export interface ChatApiResponse {
  success: boolean;
  answer?: string;
  sources?: Source[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  cost?: number | null;
  chatId?: string; // Can be null/undefined for new chats initially
  persistenceError?: string; // Optional error message
  message?: string; // Optional general message from backend
}

// Export other types from this directory if needed 