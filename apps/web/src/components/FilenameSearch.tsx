'use client';

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from 'lucide-react';

interface FilenameSearchProps {
  // Define props needed, e.g., onSearch callback
  onSearch: (query: string) => void;
  placeholder?: string; // Add optional placeholder prop
}

const FilenameSearch: React.FC<FilenameSearchProps> = ({ onSearch, placeholder }) => {
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    // Basic validation: trim query
    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      onSearch(trimmedQuery);
    }
    // Optionally clear input after search or handle empty query state
    // setQuery(''); 
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setQuery(newValue);
    onSearch(newValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="flex w-full items-center space-x-2">
      <Input
        type="search"
        placeholder={placeholder || "Search KB filenames..."} // Use prop or fallback
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        className="flex-1"
        aria-label="Search System Knowledge Base filenames"
      />
      <Button type="button" size="icon" onClick={handleSearch} aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default FilenameSearch; 