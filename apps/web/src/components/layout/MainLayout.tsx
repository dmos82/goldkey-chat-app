'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image'; // <-- Import Image component
import {
  MessageSquare,
  FileText,
  Library,
  ChevronRight,
  User,
  Menu, // For potential mobile toggle
  BrainCircuit,
  Files,
  Trash2, // Import Trash icon
  ShieldCheck, // Add an icon for Admin
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext'; // Use correct path if different
import { Button } from '@/components/ui/button'; // Use correct path
import { Switch } from "@/components/ui/switch"; // Import Switch
import { Label } from "@/components/ui/label"; // Import Label
import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton component
import { useTheme } from "next-themes"; // Import useTheme
import { Moon, Sun } from "lucide-react"; // Import Icons
import FilenameSearch from "../FilenameSearch"; // Import the new search component
import UserStatus from './UserStatus'; // Import UserStatus component
import { ChatSummary } from '@/types'; // Import ChatSummary type
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog"; // Import AlertDialog components
import { cn } from "@/lib/utils"; // Import cn for conditional class names
import { API_BASE_URL } from '@/lib/config';

// Re-define Document type locally if not imported, or ensure import is correct
interface Document {
  _id: string;
  originalFileName: string;
}

// Define the props for MainLayout
interface MainLayoutProps {
  children: ReactNode;
  activeView: 'chat' | 'docs';
  setActiveView: (view: 'chat' | 'docs') => void;
  isKbOverlayVisible: boolean;
  setIsKbOverlayVisible: (visible: boolean) => void;
  handleKbFileClick: (docId: string, sourceType: 'system', originalFileName: string) => void;
  chatContext: 'system-kb' | 'user-docs';
  setChatContext: (context: 'system-kb' | 'user-docs') => void;
  // --- Add Chat History Props ---
  chats: ChatSummary[];
  selectedChatId: string | null;
  isLoadingChats: boolean;
  handleNewChat: () => void;
  handleSelectChat: (chatId: string) => void;
  handleConfirmDelete: (chatId: string) => void; // Add delete handler prop
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeView,
  setActiveView,
  isKbOverlayVisible,
  setIsKbOverlayVisible,
  handleKbFileClick,
  chatContext,
  setChatContext,
  // Destructure new props
  chats,
  selectedChatId,
  isLoadingChats,
  handleNewChat,
  handleSelectChat,
  handleConfirmDelete, // Destructure delete handler
}) => {
  const { user } = useAuth(); // Get user for display
  const { theme, setTheme } = useTheme(); // Get theme state and setter

  // State for KB documents (now fetched within MainLayout)
  const [kbDocuments, setKbDocuments] = useState<Document[]>([]);
  const [kbLoading, setKbLoading] = useState<boolean>(false);
  const [kbError, setKbError] = useState<string | null>(null);
  const { token } = useAuth(); // Need token for fetch

  // --- Add state for search results if needed, or filter kbDocuments directly ---
  const [kbSearchTerm, setKbSearchTerm] = useState(''); // Renamed from kbSearchQuery

  // State for Delete Confirmation Dialog
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [chatToDeleteId, setChatToDeleteId] = useState<string | null>(null);
  const [chatToDeleteName, setChatToDeleteName] = useState<string>('');

  const openDeleteDialog = (chatId: string, chatName: string) => {
    setChatToDeleteId(chatId);
    setChatToDeleteName(chatName);
    setIsAlertOpen(true);
  };

  // Fetch KB docs when overlay is opened (or on mount if preferred)
  useEffect(() => {
    if (isKbOverlayVisible && token && kbDocuments.length === 0) { // Only fetch if visible and not already loaded
      const fetchSystemDocuments = async () => {
        if (!token) return;
        try {
          const response = await fetch(`${API_BASE_URL}/api/system-kb/`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!response.ok) {
            if (response.status === 401) throw new Error('Unauthorized');
            throw new Error(`Failed to fetch KB (${response.status})`);
          }
          const data = await response.json();
          if (data.success && Array.isArray(data.documents)) {
            setKbDocuments(data.documents);
          } else {
            throw new Error('Invalid KB data format');
          }
        } catch (err: any) {
          console.error("Error fetching KB docs:", err);
          setKbError(err.message || 'Failed to load System KB');
        } finally {
          setKbLoading(false);
        }
      };
      fetchSystemDocuments();
    }
  }, [isKbOverlayVisible, token]); // Removed kbDocuments.length dependency to allow re-fetch on reopen

  // --- Search Handler ---
  const handleKbSearch = (query: string) => {
    console.log("KB Search Query:", query);
    setKbSearchTerm(query.toLowerCase()); // Update state setter
    // NOTE: Current implementation filters the already fetched list.
    // For large KBs, this should trigger a backend search API call.
  };

  // --- Debug log for search term state ---
  console.log('Current kbSearchTerm:', kbSearchTerm);

  // --- Filtered Documents (Memoized) ---
  const filteredKbDocuments = React.useMemo(() => {
    console.log('[Filtering] Running filter. Term:', kbSearchTerm, 'Input Docs:', kbDocuments.length); // Debug Log
    if (!kbSearchTerm) {
      return kbDocuments; // Return all if search is empty
    }
    const searchTermLower = kbSearchTerm.toLowerCase();
    const result = kbDocuments.filter(doc => 
      doc.originalFileName.toLowerCase().includes(searchTermLower)
    );
    console.log('[Filtering] Filtered Docs Count:', result.length); // Debug Log
    return result;
  }, [kbDocuments, kbSearchTerm]); // Dependencies: original list and search term

  return (
    <div className="flex h-screen bg-background dark:bg-background text-foreground dark:text-foreground">
      {/* --- Updated Left Sidebar Area (Placeholder) --- */}
      <nav className="dark w-[240px] h-full fixed left-0 top-0 bg-accent p-3 flex flex-col flex-shrink-0 z-20 border-r border-border">
        <div className="mb-4 flex w-full">
          <Image
            src="/gk_logo_new.png" // Corrected path relative to the public folder
            alt="Gold Key Insurance Logo"
            width={216} // Full width within padding (240px - 2*12px)
            height={60} // Adjusted height proportionally
            priority // Add priority if it's above the fold / important LCP element
            unoptimized // Bypass Netlify optimization for this image
          />
        </div>

        {/* New Chat Button */}
        <Button 
          onClick={handleNewChat}
          variant="secondary"
          className="w-full mb-1 transition-all duration-200 ease-in-out hover:bg-secondary/90 hover:scale-[1.02] active:scale-[0.98]"
        >
          New Chat
        </Button>

        {/* Restyled Document Manager Button */}
        <Button 
          onClick={() => setActiveView('docs')}
          // Remove variant, apply styles directly
          className={cn(
            "w-full mb-4 justify-start text-left", // Base layout
            "px-3 py-1 text-lg font-semibold border rounded-md", // Title appearance
            "transition-all duration-200 ease-in-out", // Animation properties 
            activeView === 'docs' 
              ? "bg-primary/90 border-primary text-primary-foreground hover:bg-primary hover:scale-[1.02] active:scale-[0.98]" // Active state
              : "text-primary-foreground border-border hover:bg-muted/10 hover:scale-[1.02] active:scale-[0.98]" // Default state
          )}
        >
          Document Manager
        </Button>

        {/* Conditional Admin Link */}
        {!isLoadingChats && user?.role === 'admin' && (
          <Link href="/admin" passHref>
            <Button 
              variant="ghost" 
              className={cn(
                "w-full justify-start mb-2 text-left text-primary-foreground",
                "transition-all duration-200 ease-in-out hover:bg-muted/10 hover:scale-[1.02] active:scale-[0.98]"
                // Add active state styling if needed, e.g., based on current pathname
                // pathname === '/admin' ? "bg-primary/90 border-primary text-primary-foreground" : ""
              )}
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> {/* Admin Icon */}
              Admin Dashboard
            </Button>
          </Link>
        )}

        {/* Restyled CHATS Title */}
        <Label className="px-3 py-1 mb-2 text-lg font-semibold text-primary-foreground uppercase border rounded-md border-border"> 
          Chats
        </Label>
        
        {/* Chat List */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 mt-1">
          {isLoadingChats ? (
            // Skeleton loaders for chat list
            Array.from({ length: 4 }).map((_, index) => (
              <div 
                key={`chat-skeleton-${index}`} 
                className="flex items-center p-2 rounded-md mb-1 bg-muted/50"
              >
                <Skeleton className="h-7 w-full rounded-md" />
              </div>
            ))
          ) : chats.length === 0 ? (
             <p className="text-sm text-white p-2 text-center">No chats yet.</p>
          ) : (
            chats.map((chat) => (
              <div 
                key={chat._id} 
                className={cn(
                  "flex items-center justify-between group p-2 rounded-md mb-1 shadow-sm transition-colors duration-150 ease-in-out",
                  selectedChatId === chat._id 
                    ? "bg-primary/90 hover:bg-primary"
                    : "bg-muted/50 hover:bg-muted/80"
                )}
              > 
                <Button
                  variant="ghost"
                  className={cn(
                      "flex-1 justify-start text-left h-auto py-0 px-1 truncate focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-transparent transition-all duration-200 ease-in-out",
                      selectedChatId === chat._id ? "font-semibold" : "font-normal"
                  )}
                  onClick={() => handleSelectChat(chat._id)}
                >
                  <span 
                    className={cn(
                        "text-base truncate",
                        selectedChatId === chat._id ? "text-primary-foreground" : "text-foreground"
                    )}
                    title={chat.chatName}
                  >
                    {chat.chatName}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                      "h-7 w-7 ml-1 opacity-0 group-hover:opacity-100 transition-opacity transition-all duration-200 ease-in-out flex-shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0 hover:bg-transparent",
                      selectedChatId === chat._id ? "text-primary-foreground/70 hover:text-destructive-foreground" : "text-muted-foreground hover:text-destructive"
                  )}
                  onClick={(e) => { 
                      e.stopPropagation();
                      openDeleteDialog(chat._id, chat.chatName);
                  }}
                  title={`Delete chat: ${chat.chatName}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* User Status/Logout at bottom */}
        <div className="mt-auto pt-3 border-t border-border">
           <UserStatus />
        </div>
      </nav>

      {/* --- Main Content Area (with updated left margin) --- */}
      <div className="flex-1 flex flex-col overflow-hidden ml-[240px]">
        {/* Header remains mostly the same, but let's adjust the left content */}
        <header className="h-[48px] bg-card dark:bg-card border-b border-border flex items-center justify-between px-4 flex-shrink-0 shadow-sm z-10">
          {/* Left: Maybe breadcrumbs or active chat name? */}
          <div>
             <h2 className="text-lg font-semibold capitalize">
               {activeView === 'chat' 
                 ? (selectedChatId ? chats.find(c => c._id === selectedChatId)?.chatName || 'Chat' : 'New Chat') 
                 : 'Document Manager'}
             </h2>
          </div>

          {/* Center: Chat Context Toggle (only in chat view) */}
          <div className="flex-1 flex justify-center">
            {activeView === 'chat' && (
              <div className="flex items-center space-x-2">
                <Label htmlFor="chat-context-switch" className="text-sm font-medium flex items-center">
                  <BrainCircuit size={16} className="mr-1.5 text-muted-foreground" /> System KB
                </Label>
                <Switch
                  id="chat-context-switch"
                  checked={chatContext === 'user-docs'}
                  onCheckedChange={(checked: boolean) => setChatContext(checked ? 'user-docs' : 'system-kb')}
                  aria-label="Toggle chat context between System KB and My Documents"
                />
                <Label htmlFor="chat-context-switch" className="text-sm font-medium flex items-center">
                  <Files size={16} className="mr-1.5 text-muted-foreground" /> My Docs
                </Label>
              </div>
            )}
          </div>

          {/* Right: System KB Button, Theme Toggle */}
          <div className="flex items-center gap-3">
             <Button
              variant="outline" 
              size="sm"
              onClick={() => setIsKbOverlayVisible(true)}
              className="flex items-center gap-1.5 transition-all duration-200 ease-in-out hover:bg-muted hover:scale-[1.02] active:scale-[0.98]"
             >
               <Library size={16} />
               <span className="hidden sm:inline">System KB</span>
             </Button>
             {/* Theme Toggle */}
              <div className="flex items-center space-x-2 border-l pl-3 ml-0">
                  <Sun className="h-5 w-5 text-muted-foreground" /> 
                  <Switch
                    id="theme-mode-switch"
                    checked={theme === 'dark'}
                    onCheckedChange={(checked: boolean) => setTheme(checked ? 'dark' : 'light')}
                    aria-label={theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
                  />
                  <Moon className="h-5 w-5 text-muted-foreground" /> 
               </div>
          </div>
        </header>

        {/* --- Content Area --- */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* --- System KB Overlay --- */}
      {isKbOverlayVisible && (
        <div className="fixed inset-0 bg-black/60 z-30 flex items-start justify-center backdrop-blur-sm pt-16">
          <div className="bg-card dark:bg-card rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden border border-border">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <h3 className="text-lg font-semibold">System Knowledge Base</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsKbOverlayVisible(false)} 
                className="h-7 w-7 transition-all duration-150 ease-in-out hover:bg-muted/80 hover:scale-[1.05] active:scale-[0.95]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </Button>
            </div>
            <div className="p-3 border-b border-border">
               <FilenameSearch 
                 placeholder="Search System KB..." 
                 onSearch={handleKbSearch} // Pass the updated search handler 
               />
            </div>

            <div className="flex-1 overflow-y-auto p-1">
              {kbLoading && <p className="p-4 text-center text-muted-foreground">Loading KB...</p>}
              {kbError && <p className="p-4 text-center text-red-500">Error: {kbError}</p>}
              {!kbLoading && !kbError && (
                <div className="space-y-1">
                  {filteredKbDocuments.length > 0 ? (
                    filteredKbDocuments.map((doc) => (
                      <div
                        key={doc._id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer transition-all duration-150 ease-in-out text-sm hover:scale-[1.01]"
                        onClick={() => handleKbFileClick(doc._id, 'system', doc.originalFileName)}
                      >
                        <span className="truncate" title={doc.originalFileName}>{doc.originalFileName}</span>
                        {/* Add download/action icons if needed */}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm p-4 text-center">
                       {kbSearchTerm ? 'No matching documents found.' : 'No documents loaded yet.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the chat
              <strong className="px-1">{chatToDeleteName}</strong>
              and remove its data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setChatToDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (chatToDeleteId) {
                   handleConfirmDelete(chatToDeleteId);
                   setChatToDeleteId(null); // Reset after confirming
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div> // End flex h-screen container
  );
}; 