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

  const handleClear = () => {
    setSearchTerm("");
    onSearchResults?.([]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">Search by name, email, or phone number</p>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Input
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-8"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <Button
          onClick={performSearch}
          disabled={disabled || isPending || !searchTerm.trim()}
        >
          {isPending ? "Searching..." : "Search"}
        </Button>
      </div>
    </div>
  );
};
