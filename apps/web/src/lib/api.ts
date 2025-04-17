// Utility functions for API calls
import { Document, ChatSummary, ChatDetail } from '@/types'; // Import necessary types
import { API_BASE_URL } from './config'; // Import the centralized base URL

// Remove the local definition and log:
// const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'; 
// console.log(`[API Lib] Using API Base URL: ${API_URL}`); 

// --- Existing Document Fetch Function (Example) ---
export async function fetchDocuments(token: string): Promise<Document[]> {
  const response = await fetch(`${API_BASE_URL}/api/documents`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    // Handle errors appropriately (e.g., logout on 401)
    if (response.status === 401) throw new Error('Unauthorized');
    throw new Error('Failed to fetch documents');
  }
  const data = await response.json();
  if (!data.success || !Array.isArray(data.documents)) {
    throw new Error('Invalid data format');
  }
  return data.documents;
}

// --- New Chat List Fetch Function ---
export async function fetchChatList(token: string): Promise<ChatSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/chat/chats`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized (401)');
    throw new Error(`Failed to fetch chat list (${response.status})`);
  }
  const data = await response.json();
  if (!data.success || !Array.isArray(data.chats)) {
    throw new Error('Invalid chat list data format');
  }
  return data.chats;
}

// --- New Chat Details Fetch Function ---
export async function fetchChatDetails(chatId: string, token: string): Promise<ChatDetail> {
  const response = await fetch(`${API_BASE_URL}/api/chat/chats/${chatId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Unauthorized (401)');
    if (response.status === 404) throw new Error('Chat not found (404)');
    throw new Error(`Failed to fetch chat details (${response.status})`);
  }
  const data = await response.json();
  if (!data.success || !data.chat) {
    throw new Error('Invalid chat detail data format');
  }
  // Basic type assertion - consider more robust validation if needed
  return data.chat as ChatDetail;
}

// --- Add other API utility functions as needed --- 