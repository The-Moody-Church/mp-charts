"use client";

import React, { useState, useTransition, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchContacts } from "./actions";
import { ContactSearch } from "@/lib/dto";

interface ContactLookupSearchProps {
  placeholder?: string;
  disabled?: boolean;
  onSearchResults?: (results: ContactSearch[]) => void;
  onSearchError?: (error: string) => void;
  onSearchStart?: () => void;
}

export const ContactLookupSearch: React.FC<ContactLookupSearchProps> = ({
  placeholder = "Search contacts...",
  disabled = false,
  onSearchResults,
  onSearchError,
  onSearchStart,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      onSearchResults?.([]);
      return;
    }

    onSearchStart?.();

    startTransition(async () => {
      try {
        const results = await searchContacts(query);
        onSearchResults?.(results);
      } catch (error) {
        console.error("Search error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An error occurred while searching";
        onSearchError?.(errorMessage);
      }
    });
  };

  // Debounced search-as-you-type (300ms, minimum 2 characters)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      if (trimmed.length === 0) {
        onSearchResults?.([]);
      }
      return;
    }

    debounceRef.current = setTimeout(() => {
      handleSearch(trimmed);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Instant search on Enter or button click
  const performSearch = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (searchTerm.trim()) {
      handleSearch(searchTerm.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      performSearch();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <Input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
      <Button
        onClick={performSearch}
        disabled={disabled || isPending || !searchTerm.trim()}
      >
        {isPending ? "Searching..." : "Search"}
      </Button>
    </div>
  );
};
