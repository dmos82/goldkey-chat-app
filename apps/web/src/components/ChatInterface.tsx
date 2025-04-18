'use client';

import React, { useState, FormEvent, ChangeEvent, useEffect, useRef } from 'react';
import PdfViewerModal from './PdfViewerModal';
import { useAuth } from '@/context/AuthContext';
import { Message, Source } from '@/types'; // Import types from centralized location
import { API_BASE_URL } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

// Define search mode type
type SearchMode = 'system' | 'user';

// Define props for ChatInterface
interface ChatInterfaceProps {
  chatId: string | null; // ID of the currently active chat, null for a new chat
  messages: Message[]; // Messages for the current chat, passed from parent
  isLoadingMessages: boolean; // Whether messages are being loaded (for history)
  onSourceClick?: (source: Source) => void;
  chatContext: 'system-kb' | 'user-docs'; // Add chatContext prop
  onNewMessages: (userQuery: string, apiResponseData: any) => void; // Renamed and updated prop
}

export default function ChatInterface({ 
  chatId,
  messages,
  isLoadingMessages,
  onSourceClick, 
  chatContext,
  onNewMessages // Renamed prop
}: ChatInterfaceProps) {
  console.log('[ChatInterface Render] Received messages prop:', messages);

  const [query, setQuery] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false); // Local loading state for submit button
  const [error, setError] = useState<string>(''); // Local error state for submission errors
  const { token, logout } = useAuth();
  const chatEndRef = useRef<null | HTMLDivElement>(null);
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]); // Scroll when messages change

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isSending) {
      return;
    }

    if (!token) {
        setError('Error: You must be logged in to chat.');
        console.error('[handleSubmit] User not logged in. Aborting chat request.');
        return;
    }

    setError(''); // Clear previous submission errors
    const currentQuery = query; // Store query before clearing
    setQuery(''); 
    setIsSending(true); // Indicate that a message is being sent

    console.log('[handleSubmit] Sending Query:', trimmedQuery, 'to ChatId:', chatId, 'with Context:', chatContext);

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };

      // Prepare history from props (excluding potential loading messages)
      const historyPayload = messages
          .filter(m => m.sender === 'user' || m.sender === 'assistant') // Basic filter
          .map(m => ({ sender: m.sender, text: m.text })); // Map to { sender, text }

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          query: trimmedQuery,
          // Send message history excluding the latest (which might be the user's input if added optimistically)
          history: historyPayload,
          searchMode: chatContext,
          chatId: chatId // Pass the current chatId (null for new chat)
        }),
      });

      if (response.status === 401) {
        console.error('[handleSubmit] Authentication failed (401).');
        setError('Session expired. Please log in again.');
        logout();
        setIsSending(false);
        return;
      }
      
      const result = await response.json();

      if (!response.ok) {
          console.error(`[handleSubmit] HTTP error! Status: ${response.status}`, result);
          const errorMsg = result?.message || `Request failed with status: ${response.status}`;
          // Display error locally, parent doesn't need to know about transient submit errors
          setError(`Error: ${errorMsg}`); 
          // Optionally, re-add user query to input if desired on failure
          // setQuery(currentQuery);
          throw new Error(errorMsg); // Throw to prevent success callback
      }

      // Check for persistence errors reported by backend
      if (result.persistenceError) {
          console.warn('[ChatInterface] Backend reported persistence error:', result.persistenceError);
          // Optionally show a non-blocking warning to the user
          setError(`Warning: ${result.persistenceError}`); // Show as warning, maybe not critical
      }

      console.log('[handleSubmit] Response OK, Data:', result);

      // SUCCESS: Call parent callback with the user query and API response data
      onNewMessages(trimmedQuery, result);
      setQuery(''); // Clear input after successfully passing data up

    } catch (err) {
      console.error('Chat request failed:', err);
      // Error state is already set if it was an HTTP error with message
      if (!error) { // Only set if not already set by HTTP error check
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
          setError(`Error: ${errorMessage}`); 
      }
      // No need to add error message to chat history here, parent controls messages
    } finally {
      setIsSending(false);
      console.log('[handleSubmit] Finally block reached, isSending set to false.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark text-text-primary-light dark:text-text-primary-dark">
      <div className="flex-grow overflow-y-auto p-4 space-y-6">
        {messages.map((msg, index) => (
          <div 
            key={msg._id || index} 
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`relative max-w-[85%] md:max-w-[75%] p-3.5 shadow-md rounded-2xl ${
                msg.sender === 'user'
                  ? 'bg-blue-100 dark:bg-blue-800 rounded-br-sm'
                  : 'bg-gray-100 dark:bg-gray-700 rounded-tl-sm'
              }`}
            >
              <div className="w-full h-full">
                {msg.sender === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap text-black dark:text-white">
                    {msg.text}
                  </p>
                ) : (
                  <p className="text-sm whitespace-pre-wrap text-black dark:text-white">{msg.text}</p>
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 items-center text-xs">
                    <span className="font-semibold mr-1">Sources:</span>
                    {msg.sources.map((source, idx) => {
                      return (
                        <Button
                          key={`source-${msg._id}-${idx}`}
                          variant="outline"
                          size="sm"
                          className="h-auto px-2 py-1 text-xs border-primary/50 hover:bg-primary/10"
                          onClick={() => {
                            onSourceClick?.(source);
                          }}
                          disabled={!source.documentId}
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          {source.source || 'Unknown File'} {source.pageNumbers?.length ? `(p. ${source.pageNumbers.join(', ')})` : ''}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
              {msg.sender === 'user' && (
                <div className="absolute w-0 h-0 bottom-[6px] right-[-8px] border-8 border-transparent border-l-primary-light dark:border-l-primary-dark"></div>
              )}
              {msg.sender === 'assistant' && (
                <div className="absolute w-0 h-0 top-[6px] left-[-8px] border-8 border-transparent border-r-gray-100 dark:border-r-gray-700"></div>
              )}
            </div>
          </div>
        ))}
        {isLoadingMessages && (
          <div className="flex justify-start">
            <div className="relative p-3 rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-gray-700 text-text-secondary-light dark:text-text-secondary-dark italic text-sm shadow-md">
              Loading chat history... <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-current ml-1"></span>
              <div className="absolute w-0 h-0 top-[6px] left-[-8px] border-8 border-transparent border-r-gray-100 dark:border-r-gray-700"></div>
            </div>
          </div>
        )}
        {isSending && (
          <div className="flex justify-end">
            <div style={{
              backgroundColor: 'var(--user-bubble-bg, #e0e0e0)', 
              color: 'var(--user-bubble-text, #222222)',
              borderRadius: '16px',
              borderBottomRightRadius: '4px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              padding: '12px',
              fontStyle: 'italic',
              fontSize: '0.875rem',
              fontWeight: '500'
            }} className="relative rounded-2xl rounded-br-sm user-bubble user-bubble-light shadow-md">
              Sending... <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-current ml-1"></span>
              <div className="absolute w-0 h-0 bottom-[6px] right-[-8px] border-8 border-transparent" style={{
                borderLeftColor: 'var(--user-bubble-bg, #e0e0e0)'
              }}></div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      {error && (
        <p className="px-4 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="p-4 border-t border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-start space-x-3">
          <textarea
            rows={1}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your message..."
            className="flex-grow p-3 border border-border-light dark:border-border-dark rounded-[18px] focus:outline-none focus:ring-2 focus:ring-primary-light dark:focus:ring-primary-dark bg-gray-100 dark:bg-gray-700 text-text-primary-light dark:text-text-primary-dark placeholder-text-secondary-light dark:placeholder-text-secondary-dark resize-none overflow-y-auto max-h-40"
            disabled={isSending || isLoadingMessages}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }}
          />
          <button
            type="submit"
            disabled={!query.trim() || isSending || isLoadingMessages}
            className="px-4 py-3 bg-primary-light dark:bg-primary-dark text-white rounded-full hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-light dark:focus:ring-primary-dark dark:focus:ring-offset-background-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out hover:scale-[1.02] active:scale-[0.98] self-end border border-primary-light/50 dark:border-primary-dark/50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
} 