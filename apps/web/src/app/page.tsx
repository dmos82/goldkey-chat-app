'use client'; // This page now uses client-side components

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { 
  MessageSquare,
  FileText,
  Library,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/context/AuthContext'; // Reverted to Alias Path
// --- Ensure backend imports are removed ---
// import { Chat, IChatMessage as Message } from '../../api/src/models/ChatModel'; 

import { Button } from '@/components/ui/button'; // Reverted to Alias Path
import ProtectedRoute from '@/components/ProtectedRoute'; // Reverted to Alias Path
import ChatInterface from '@/components/ChatInterface'; // Reverted to Alias Path
import DocumentList from '@/components/DocumentList'; // Reverted to Alias Path
import FileUpload from '@/components/FileUpload'; // Reverted to Alias Path
import PdfViewerModal from '@/components/PdfViewerModal'; // Reverted to Alias Path
import { MainLayout } from '@/components/layout/MainLayout'; // Reverted to Alias Path
import { fetchDocuments, fetchChatList, fetchChatDetails } from '@/lib/api'; // Added chat API calls
// --- Import types from @/types --- 
import { Document, Message, ChatSummary, ChatDetail } from '@/types'; // Import required types from @/types
import { useToast } from "@/components/ui/use-toast"; // Import useToast
import { useInactivityTimer } from "@/hooks/useInactivityTimer"; // Import the new hook
// Re-lint trigger comment

// Type definitions (consider moving to types/)
type ActiveView = 'chat' | 'docs';
type ActiveDocTab = 'my-docs-tab' | 'kb-search-tab';
type DocumentType = 'user' | 'system';

interface SystemDocument {
  _id: string;
  originalFileName: string;
  // Add other relevant fields if needed
}

// Simplified Chat Summary type for the list
// --- Ensure local conflicting types are removed --- 
/*
interface ChatSummary {
  _id: string;
  chatName: string;
  updatedAt: string; // Keep as string for simplicity, format later if needed
  createdAt: string;
}
*/

export default function Home() {
  // --- State variables that CONTROL the layout ---
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [isKbOverlayVisible, setIsKbOverlayVisible] = useState<boolean>(false);
  const [chatContext, setChatContext] = useState<'system-kb' | 'user-docs'>('system-kb'); // Default to System KB

  // --- State variables needed by page CONTENT ---
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalFileUrl, setModalFileUrl] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalInitialPage, setModalInitialPage] = useState<number | undefined>(undefined);
  const [modalHighlightText, setModalHighlightText] = useState<string | undefined>(undefined);
  const [modalTitle, setModalTitle] = useState<string>('');
  const { token, logout } = useAuth(); // Still needed for handlers

  const { theme, setTheme } = useTheme();

  // --- Chat History State ---
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const { toast } = useToast(); // Initialize toast

  // --- Setup Inactivity Timer --- 
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  
  // Define a logout function with toast message
  const inactivityLogout = useCallback(() => {
    toast({ title: "Session Expired", description: "You have been logged out due to inactivity." });
    logout(); // Call the original logout function from context
  }, [logout, toast]);

  // Use the hook - This will only run client-side and when user is authenticated (due to ProtectedRoute)
  useInactivityTimer(INACTIVITY_TIMEOUT_MS, inactivityLogout);

  // --- Fetch Chat List ---
  const loadChatList = useCallback(async () => {
    if (!token) return; // Don't fetch if no token
    setIsLoadingChats(true);
    setChatError(null);
    try {
      // Call the utility function from api.ts, passing the token
      const fetchedChats = await fetchChatList(token);
      setChats(fetchedChats);
    } catch (error: any) {
      console.error("Error fetching chat list:", error);
      setChatError(error.message || 'Failed to load chat list.');
      // Check error message for 401/Unauthorized and logout if found
      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        toast({ // Add toast notification on forced logout
            title: "Authentication Error",
            description: "Your session may have expired. Please log in again.",
            variant: "destructive",
        });
        logout(); // Call logout from AuthContext
      }
    } finally {
      setIsLoadingChats(false);
    }
  }, [token, logout, toast]); // Added toast to dependencies

  // --- Trigger Fetch on Mount/Token Change --- 
  useEffect(() => {
    // Only attempt to load chats when a valid token is present
    if (token) {
      console.log('[Page Effect] Token found, loading chat list...'); // Add log
      loadChatList();
    } else {
      // Optional: Clear chats if token becomes null (e.g., after logout)
      console.log('[Page Effect] No token found, clearing chat list.'); // Add log
      setChats([]);
      setIsLoadingChats(false); // Ensure loading is false if no token
    }
    // Depend directly on the token value, keep loadChatList as it uses hooks too
  }, [token, loadChatList]); // Updated dependencies

  // --- Fetch Messages for Selected Chat ---
  useEffect(() => {
    if (!selectedChatId || !token) {
      setCurrentMessages([]); // Clear messages if no chat is selected
      return;
    }

    const loadMessages = async () => {
      console.log('[Effect loadMessages] Running for chatId:', selectedChatId); // Log entry
      setIsLoadingMessages(true);
      setChatError(null);
      try {
        const chatDetails: ChatDetail = await fetchChatDetails(selectedChatId, token);
        console.log('[Effect loadMessages] Received chatDetails:', chatDetails); // Log fetched data

        const newMessages: Message[] = chatDetails.messages.map(msg => ({ 
            sender: msg.role,
            text: msg.content,
            sources: msg.sources?.map(s => ({
                source: s.fileName,
                pageNumbers: s.pageNumbers,
                documentId: s.documentId,
                type: s.type
            })) || [], // Ensure sources is always an array
            // Add timestamp if available and needed in Message type
            timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString()
        }));
        
        console.log('[Effect loadMessages] Preparing to set messages:', newMessages); // Log messages before setting state
        setCurrentMessages(newMessages); 
        console.log('[Effect loadMessages] State updated with messages.'); // Log after setting state

      } catch (error: any) {
        console.error(`Error fetching messages for chat ${selectedChatId}:`, error);
        setChatError(error.message || 'Failed to load messages.');
        setCurrentMessages([]); // Clear messages on error
        if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
           logout();
        }
        // Consider resetting selectedChatId if chat not found (404)
        if (error.message?.includes('404')) {
            setSelectedChatId(null);
            // Optionally refresh chat list
            loadChatList();
        }
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadMessages();
  }, [selectedChatId, token, logout]); // Removed loadChatList from deps

  // --- Handlers ---
  const handleUploadSuccess = () => {
    console.log('[Home] Refreshing document list');
    setRefreshKey(prev => prev + 1);
  };

  const openModal = useCallback((url: string, initialPage?: number, highlightText?: string, title?: string) => {
    setModalFileUrl(url);
    setModalInitialPage(initialPage || 1);
    setModalHighlightText(highlightText);
    setModalTitle(title || '');
    setIsModalOpen(true);
  }, []); // Added useCallback

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    if (modalFileUrl && modalFileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(modalFileUrl);
    }
    setModalFileUrl(null);
    setModalInitialPage(undefined);
    setModalHighlightText(undefined);
    setModalTitle('');
  }, [modalFileUrl]); // Added useCallback

  const handleFileClick = useCallback(async (docId: string, sourceType: 'system' | 'user', originalFileName: string, initialPage?: number, chunkText?: string) => {
    console.log(`[Home] handleFileClick: docId=${docId}, sourceType=${sourceType}, fileName=${originalFileName}, page=${initialPage}`);
    if (!token) { /* Add proper handling for no token */ console.error("No auth token found!"); return; }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    let endpoint = '';
    // Adjusted endpoints based on typical API structure
    if (sourceType === 'system') endpoint = `/api/system-kb/download/${docId}`; 
    else if (sourceType === 'user') endpoint = `/api/documents/user/${docId}`; // Revert back to the correct user document endpoint
    else return;

    try {
        const response = await fetch(`${apiUrl}${endpoint}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) { 
             console.error(`Failed to fetch ${sourceType} doc: ${response.status}`);
             if (response.status === 401 && logout) logout(); // Example: logout on 401
             // Add user feedback (e.g., toast notification)
             alert(`Error fetching document: ${response.statusText}`); // Simple feedback
             return;
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        openModal(blobUrl, initialPage, chunkText, originalFileName);
    } catch (error) {
        console.error('Error fetching/processing document:', error);
        // Add user feedback
        alert('An error occurred while loading the document.'); // Simple feedback
    }
  }, [token, openModal, logout]); // Dependencies for useCallback

  // --- Chat History Handlers ---
  const handleNewChat = () => {
    setSelectedChatId(null);
    setCurrentMessages([]);
    // Ensure the view switches to chat if not already there
    if (activeView !== 'chat') {
        setActiveView('chat');
    }
  };

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    // Ensure the view switches to chat if not already there
    if (activeView !== 'chat') {
        setActiveView('chat');
    }
  };

  // Renamed and updated handler: Called by ChatInterface after successful POST /api/chat
  const handleNewMessages = (userQuery: string, apiResponseData: any) => {
    console.log('[handleNewMessages] Received Data:', { userQuery, apiResponseData }); // Log input

    // Construct messages
    // RE-ADD DETAILED LOGGING FOR DEBUGGING REGRESSION
    const userMessage: Message = { 
        _id: `user-temp-${Date.now()}`, // Add temporary ID
        sender: 'user' as const, 
        text: userQuery, 
        sources: [], 
        timestamp: new Date().toISOString() 
    };
    const assistantMessage: Message = { 
        _id: apiResponseData.messageId || `asst-temp-${Date.now()}`, // Add temporary/API ID
        sender: 'assistant' as const, 
        text: apiResponseData.answer,      // Correct key based on logs for the second message
        sources: apiResponseData.sources?.map((s: any) => ({ // Assuming source structure
            source: s.source, 
            pageNumbers: s.pageNumbers, 
            documentId: s.documentId,
            type: s.type
        })) || [],
        timestamp: new Date().toISOString()
    };

    setCurrentMessages(prevMessages => {
      console.log('[handleNewMessages] Previous Messages State:', prevMessages); // Log state BEFORE update
      // Calculate the next state for logging BEFORE returning it
      const nextMessages = [...prevMessages, userMessage, assistantMessage];
      console.log('[handleNewMessages] Calculated New Messages State:', nextMessages); // Log the calculated new state
      return nextMessages; // Return the calculated new state
    });

    // If this was the first message in a new chat, we need the new chat ID
    // and need to refresh the chat list and select the new chat
    if (!selectedChatId && apiResponseData.chatId) {
      setSelectedChatId(apiResponseData.chatId);
      loadChatList(); // Refresh the chat list to include the new chat
    }
  };

  // --- New Delete Chat Handler ---
  const handleConfirmDelete = async (chatIdToDelete: string) => {
    console.log(`[Delete Chat] Attempting to delete chat: ${chatIdToDelete}`);
    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Authentication token not found." });
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/chat/chats/${chatIdToDelete}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const result = await response.json(); // Try to parse JSON regardless of status

      if (!response.ok) {
        // Use message from backend if available, otherwise use status text
        const errorMsg = result?.message || response.statusText || `Failed to delete chat (${response.status})`;
        throw new Error(errorMsg);
      }

      console.log(`[Delete Chat] Successfully deleted chat: ${chatIdToDelete}`);
      toast({ title: "Success", description: result.message || "Chat deleted successfully." });

      // Update frontend state
      setChats(prevList => prevList.filter(chat => chat._id !== chatIdToDelete));

      // If the deleted chat was the active one, clear the main view
      if (selectedChatId === chatIdToDelete) {
        setSelectedChatId(null);
        setCurrentMessages([]);
      }

    } catch (error: any) {
      console.error("[Delete Chat] Error deleting chat:", error);
      toast({ variant: "destructive", title: "Error Deleting Chat", description: error.message });
    }
  };

  // Clean up Blob URL on unmount (consider moving to modal if more robust handling needed)
  useEffect(() => {
    return () => {
      if (modalFileUrl && modalFileUrl.startsWith('blob:')) {
        URL.revokeObjectURL(modalFileUrl);
      }
    };
  }, [modalFileUrl]);

  return (
    <ProtectedRoute>
      <MainLayout
        activeView={activeView}
        setActiveView={setActiveView}
        isKbOverlayVisible={isKbOverlayVisible}
        setIsKbOverlayVisible={setIsKbOverlayVisible}
        handleKbFileClick={(docId, sourceType, fileName) => handleFileClick(docId, sourceType, fileName)}
        chatContext={chatContext}
        setChatContext={setChatContext}
        // Pass chat state and handlers to MainLayout (for sidebar)
        chats={chats}
        selectedChatId={selectedChatId}
        isLoadingChats={isLoadingChats}
        handleNewChat={handleNewChat}
        handleSelectChat={handleSelectChat}
        handleConfirmDelete={handleConfirmDelete} // Pass down the delete handler
      >
        {/* --- Main Content Area (Passed as children to MainLayout) --- */}
        <div id="content-switcher" className="p-4 h-full"> {/* Use h-full if chat needs it */}
          {/* Display Chat Error if any */}
          {chatError && activeView === 'chat' && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md">
                  Chat Error: {chatError}
              </div>
          )}

          {/* --- CHAT VIEW --- */}
          {activeView === 'chat' && (
            <div id="chat-view" className="h-full flex flex-col">
              {/* ChatInterface handles internal scrolling and layout */}
              <ChatInterface
                  // Key prop forces remount (and state reset) when chat ID changes, essential if it keeps internal state
                  // key={selectedChatId || 'new-chat'} 
                  chatId={selectedChatId} // Pass selected chat ID
                  messages={currentMessages} // Pass current messages
                  isLoadingMessages={isLoadingMessages} // Pass loading state
                  onSourceClick={(docId, sourceType, page, fileName) => handleFileClick(docId, sourceType, fileName || 'Unknown File', page)}
                  chatContext={chatContext}
                  onNewMessages={handleNewMessages} // Pass renamed handler
              />
            </div>
          )}

          {/* --- DOCS VIEW --- Now only shows My Documents */}
          {activeView === 'docs' && (
            <div className="space-y-4">
              {/* Render My Documents Content Directly */}
              <div className="space-y-4">
                  <div className="bg-card dark:bg-card rounded-md p-4 shadow"> 
                     <FileUpload onUploadSuccess={handleUploadSuccess} />
                  </div>
                  <div className="bg-card dark:bg-card rounded-md p-4 shadow"> 
                     <DocumentList
                        key={refreshKey}
                        onOpenFile={(docId: string, fileName: string) => handleFileClick(docId, 'user', fileName)} 
                      />
                  </div>
              </div>
            </div>
          )}
        </div> {/* End #content-switcher */}

        {/* PDF Viewer Modal - Rendered outside MainLayout's children */} 
        {/* Modal logic moved outside MainLayout children rendering area */}
        {isModalOpen && modalFileUrl && (
          <PdfViewerModal
            isOpen={isModalOpen}
            onClose={closeModal}
            fileUrl={modalFileUrl}
            initialPageNumber={modalInitialPage ?? 1}
            chunkText={modalHighlightText}
            title={modalTitle}
          />
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}
