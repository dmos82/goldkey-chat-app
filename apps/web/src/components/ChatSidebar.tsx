import React, { useState, useEffect } from 'react';
import { fetchChatList } from '@/lib/api';
import { useToast } from "@/components/ui/use-toast";
import { ChatSummary } from '@/types';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface ChatSidebarProps {
  onSelectChat: (chatId: string | null) => void;
  onCreateNewChat: () => void;
  selectedChatId: string | null;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  onSelectChat,
  onCreateNewChat,
  selectedChatId,
}) => {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token, handleApiError } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!token) return;

    const loadChats = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedChats = await fetchChatList(token);
        const sortedChats = fetchedChats.sort((a: ChatSummary, b: ChatSummary) => {
          const dateA = new Date(a.updatedAt).getTime();
          const dateB = new Date(b.updatedAt).getTime();
          return dateB - dateA;
        });
        setChats(sortedChats);
      } catch (err) {
        console.error('Failed to fetch chats:', err);
        const handled = handleApiError(err);
        if (!handled) {
          setError('Failed to load chats. Please try again later.');
          toast({
            title: "Error",
            description: "Failed to load chats.",
            variant: "destructive",
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadChats();
  }, [token, handleApiError, toast]);

  return (
    <div className="flex flex-col h-full border-r bg-gray-50 dark:bg-gray-900/50">
      <div className="p-4 border-b">
        <Button
          onClick={onCreateNewChat}
          className="w-full justify-start"
          variant="outline"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-center text-sm text-gray-500">Loading chats...</p>}
        {error && !isLoading && <p className="p-4 text-center text-sm text-red-500">{error}</p>}
        {!isLoading && !error && chats.length === 0 && (
          <p className="p-4 text-center text-sm text-gray-500">No chats yet. Start a new one!</p>
        )}
        {!isLoading && !error && chats.map((chat) => (
          <div
            key={chat._id}
            onClick={() => onSelectChat(chat._id)}
            className={`p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
              selectedChatId === chat._id ? 'bg-gray-100 dark:bg-gray-800 font-semibold' : ''
            }`}
          >
            <p className="text-sm truncate">{chat.chatName || 'New Chat'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(chat.updatedAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatSidebar; 