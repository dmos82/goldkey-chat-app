'use client'; // This page now uses client-side components

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { 
  MessageSquare,
  FileText,
  Library,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/context/AuthContext'; // Reverted to Alias Path
// --- Ensure backend imports are removed ---
// import { Chat, IChatMessage as Message } from '../../api/src/models/ChatModel'; 

import { Button } from '@/components/ui/button'; // Reverted to Alias Path
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

import ProtectedRoute from '@/components/ProtectedRoute'; // Reverted to Alias Path
import ChatInterface from '@/components/ChatInterface'; // Reverted to Alias Path
import DocumentList from '@/components/DocumentList'; // Reverted to Alias Path
import FileUpload from '@/components/FileUpload'; // Reverted to Alias Path
import PdfViewerModal from '@/components/PdfViewerModal'; // Reverted to Alias Path
import { MainLayout } from '@/components/layout/MainLayout'; // Reverted to Alias Path
import { fetchDocuments, fetchChatList, fetchChatDetails } from '@/lib/api'; // Added chat API calls
// --- Import types from @/types --- 
import { Document, Message, ChatSummary, ChatDetail, Source } from '@/types'; // Import required types from @/types
import { useToast } from "@/components/ui/use-toast"; // Import useToast
import { useInactivityTimer } from "@/hooks/useInactivityTimer"; // Import the new hook
import { API_BASE_URL } from '@/lib/config';
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
  const [isDeletingAll, setIsDeletingAll] = useState(false); // State for delete button loading

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

        // --- CORRECTED MAPPING & MERGE LOGIC ---
        // Map messages from API response (using FrontendChatMessage structure)
        const newMessagesFromApi = chatDetails.messages.map(msg => ({
            _id: (msg as any)._id, // Attempt to access _id if it exists, maybe type needs update?
            sender: msg.role,
            text: msg.content,
            sources: msg.sources?.map(s => ({
                source: s.fileName,
                pageNumbers: s.pageNumbers,
                documentId: s.documentId,
                type: s.type
            })) || [],
            // Assume usage/cost aren't part of FrontendChatMessage type yet - handle in UI only?
            // usage: (msg as any).usage || null, 
            // cost: (msg as any).cost !== undefined ? (msg as any).cost : null,
            usage: null, // Set to null for historical messages if not in type
            cost: null, // Set to null for historical messages if not in type
            timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString()
        }));

        // --- Use functional update to merge fetched and optimistic messages ---
        setCurrentMessages(prevMessages => {
            // Identify optimistic messages: those in prevMessages not having a matching _id in newMessagesFromApi
            const optimisticMessages = prevMessages.filter(
                // Ensure both _ids exist before comparing
                pMsg => pMsg._id && !newMessagesFromApi.some(apiMsg => apiMsg._id && apiMsg._id === pMsg._id)
            );

            // Combine the fetched messages with the unique optimistic ones
            const combinedMessages = [
                ...newMessagesFromApi,
                ...optimisticMessages
            ];

            console.log(`[loadMessages] Merged ${newMessagesFromApi.length} fetched with ${optimisticMessages.length} optimistic messages. Total: ${combinedMessages.length}`);
            // Sort combined messages by timestamp to ensure correct order
            return combinedMessages.sort((a, b) => 
                new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
            );
        });
        console.log('[Effect loadMessages] State update queued with merged messages.'); // Log after setting state

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

    // --- TEMPORARILY DISABLED FOR DEBUGGING ---
    // loadMessages();
    // -----------------------------------------
    loadMessages(); // <-- RESTORED THIS CALL

  }, [selectedChatId, token, logout]); // Dependencies

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

  const handleFileClick = useCallback(async (source: Source) => {
    // Extract data from the source object
    const docId = source.documentId;
    const sourceType = source.type;
    const originalFileName = source.source; // Use source.source as the filename
    const initialPage = source.pageNumbers?.[0];
    // Assuming chunkText isn't directly available on Source, pass undefined or derive if needed
    const chunkText = undefined; 
    
    console.log(`[Home] handleFileClick received source:`, JSON.stringify(source, null, 2)); // Log the received object
    
    if (!token) { console.error("No auth token found!"); return; }
    if (!docId) { console.error("Source is missing documentId!", source); return; }

    let endpoint = '';
    if (sourceType === 'system') endpoint = `/api/system-kb/download/${docId}`; 
    else if (sourceType === 'user') endpoint = `/api/documents/user/${docId}`; 
    else {
      console.error('Invalid sourceType in handleFileClick:', sourceType);
      return; // Handle invalid type
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers: { 'Authorization': `Bearer ${token}` } });
        
        if (!response.ok) { 
             console.error(`Failed to fetch ${sourceType} doc: ${response.status}`);
             if (response.status === 401 && logout) logout(); 
             // Use toast instead of alert
             toast({ 
                variant: "destructive",
                title: "Error Fetching Document",
                description: `Status: ${response.status} ${response.statusText}`
             });
             return;
        }
        
        // --- Check Content-Type --- 
        const contentType = response.headers.get('Content-Type');
        console.log(`[handleFileClick] Fetched file Content-Type: ${contentType}`);

        if (contentType && contentType.includes('application/pdf')) {
            // It's a PDF, proceed with viewer
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            // Pass extracted data to openModal, especially originalFileName
            openModal(blobUrl, initialPage, chunkText, originalFileName); 
        } else {
            // Not a PDF - Handle differently (e.g., direct download or message)
            console.warn(`[handleFileClick] Non-PDF content type received (${contentType}). Attempting direct download.`);
            toast({ 
                title: "Preview Unavailable",
                description: `Direct download started for non-PDF file: ${originalFileName}`,
                variant: "default"
             });
             // Create blob URL anyway for download link
             const blob = await response.blob();
             const blobUrl = URL.createObjectURL(blob);
             // Create a temporary link and click it
             const link = document.createElement('a');
             link.href = blobUrl;
             link.download = originalFileName || 'downloaded-file';
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
             URL.revokeObjectURL(blobUrl); // Clean up blob URL after download starts
        }

    } catch (error: any) {
        console.error('Error fetching/processing document:', error);
        // Use toast for general errors
        toast({ 
            variant: "destructive",
            title: "Error",
            description: error.message || 'An error occurred while loading the document.'
        });
    }
  }, [token, openModal, logout, toast]); // Dependencies updated

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

  // *** MODIFIED: handleNewMessages to include usage/cost ***
  const handleNewMessages = (userQuery: string, apiResponseData: any) => {
    console.log('[handleNewMessages] User Query:', userQuery);
    console.log('[handleNewMessages] API Response:', apiResponseData);

    const newUserMessage: Message = {
      sender: 'user',
      text: userQuery,
      timestamp: new Date().toISOString()
      // No usage/cost for user messages
    };

    const newAssistantMessage: Message = {
      sender: 'assistant',
      text: apiResponseData.answer || 'No response text found.',
      sources: apiResponseData.sources?.map((s: any) => ({ 
          source: s.fileName, // Map fileName to source
          pageNumbers: s.pageNumbers || [], // Ensure pageNumbers is an array
          documentId: s.documentId,
          type: s.type
      })) || [],
      timestamp: new Date().toISOString(),
      // *** ADDED: Store usage and cost if available ***
      usage: apiResponseData.usage || null,
      cost: apiResponseData.cost !== undefined ? apiResponseData.cost : null,
    };

    // Update state
    setCurrentMessages(prevMessages => [...prevMessages, newUserMessage, newAssistantMessage]);

    // Update chat list if it's a new chat
    if (!selectedChatId && apiResponseData.chatId) {
      // Refresh chat list to include the new chat (and potentially title)
      loadChatList();
      // Select the newly created chat
      setSelectedChatId(apiResponseData.chatId);
    } else if (selectedChatId === apiResponseData.chatId) {
      // If it's the current chat, update its entry in the list (for updatedAt)
      setChats(prevChats => 
        prevChats.map(chat => 
          chat._id === selectedChatId ? { ...chat, updatedAt: new Date().toISOString() } : chat
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) // Re-sort
      );
    } else if (selectedChatId && !apiResponseData.chatId) {
      console.warn('[handleNewMessages] API response did not return a chatId for an existing chat update.');
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
      // Use dynamic endpoint based on chatId presence
      const endpoint = chatIdToDelete ? `/api/chat/chats/${chatIdToDelete}` : '/api/chat/chats';
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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

  // --- Handler for Deleting ALL CHATS ---
  const handleConfirmDeleteAllChats = async () => {
    console.log(`[Delete All Chats] Attempting to delete all chats for user`);
    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Authentication token not found." });
      return;
    }
    setIsDeletingAll(true); // Reuse deleting state or create a new one? Reusing for now.

    try {
      // Use the dedicated endpoint for deleting all chats
      const response = await fetch(`${API_BASE_URL}/api/chat/all`, { // <-- Endpoint for deleting all chats
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const result = await response.json(); // Try to parse JSON regardless of status

      if (!response.ok) {
        // Use message from backend if available, otherwise use status text
        const errorMsg = result?.message || response.statusText || `Failed to delete all chats (${response.status})`;
        throw new Error(errorMsg);
      }

      console.log(`[Delete All Chats] Successfully deleted ${result.deletedCount || 0} chats.`);
      toast({ title: "Success", description: result.message || "All chats deleted successfully." });

      // Update frontend state
      setChats([]); // Clear the chat list
      setSelectedChatId(null); // Unselect any active chat
      setCurrentMessages([]); // Clear messages

    } catch (error: any) {
      console.error("[Delete All Chats] Error deleting chats:", error);
      toast({ variant: "destructive", title: "Error Deleting Chats", description: error.message });
    } finally {
        setIsDeletingAll(false); // Reset loading state
    }
  };

  // --- Handler for Deleting ALL User Documents ---
  const handleDeleteAllDocuments = async () => {
    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Authentication token not found." });
      return;
    }
    setIsDeletingAll(true);
    console.log('[Delete All Docs] Initiating deletion...');

    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/user/all`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const result = await response.json(); // Assume backend sends JSON response

      if (!response.ok) {
        throw new Error(result.message || `Failed to delete documents (${response.status})`);
      }

      console.log('[Delete All Docs] Success:', result);
      toast({ title: "Success", description: result.message || "All documents deleted." });
      // Refresh the document list by changing the key
      setRefreshKey(prev => prev + 1);

    } catch (error: any) {
      console.error('[Delete All Docs] Error:', error);
      toast({ 
        variant: "destructive", 
        title: "Error Deleting Documents", 
        description: error.message || "An unknown error occurred."
      });
    } finally {
      setIsDeletingAll(false);
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
        handleKbFileClick={(docId, sourceType, fileName) => handleFileClick({ documentId: docId, type: sourceType, source: fileName })}
        chatContext={chatContext}
        setChatContext={setChatContext}
        // Pass chat state and handlers to MainLayout (for sidebar)
        chats={chats}
        selectedChatId={selectedChatId}
        isLoadingChats={isLoadingChats}
        handleNewChat={handleNewChat}
        handleSelectChat={handleSelectChat}
        handleConfirmDelete={handleConfirmDelete}
        onDeleteAllChats={handleConfirmDeleteAllChats}
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
                  // Pass the updated handleFileClick
                  onSourceClick={handleFileClick} 
                  chatContext={chatContext}
                  onNewMessages={handleNewMessages} // Pass renamed handler
              />
            </div>
          )}

          {/* --- DOCS VIEW --- */}
          {activeView === 'docs' && (
            <div className="space-y-4">
              <div className="space-y-4">
                  <div className="bg-card dark:bg-card rounded-md p-4 shadow"> 
                     <FileUpload onUploadSuccess={handleUploadSuccess} />
                  </div>
                  <div className="bg-card dark:bg-card rounded-md p-4 shadow space-y-4">
                    {/* --- Document List Component --- */}
                     <DocumentList
                        key={refreshKey}
                        onOpenFile={(docId: string, fileName: string) => handleFileClick({ documentId: docId, type: 'user', source: fileName })} 
                      />
                      
                    {/* --- Delete All Button and Dialog --- */}
                    <div className="pt-4 border-t border-border">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" disabled={isDeletingAll}>
                            <Trash2 className="mr-2 h-4 w-4" /> 
                            {isDeletingAll ? 'Deleting...' : 'Delete All My Documents'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to permanently delete ALL your uploaded documents?
                              This action cannot be undone and will remove all associated data.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={handleDeleteAllDocuments} 
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
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
