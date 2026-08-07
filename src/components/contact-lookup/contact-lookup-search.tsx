"use client";

import React, { useRef, useState, useTransition } from "react";
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
  const [activeOnly, setActiveOnly] = useState(true);
  const [isPending, startTransition] = useTransition();
  const hasSearched = useRef(false);

  // `scopeActiveOnly` is a REQUIRED parameter rather than read from state. The
  // "Active contacts only" toggle used to re-run the search from an effect keyed
  // on `activeOnly`, because calling it from the change handler would have read
  // the stale pre-commit value. Searching with the wrong scope silently returns
  // or hides inactive contacts, so the caller is now forced to pass the value it
  // means — the type checker catches what a reviewer would have to notice.
  const handleSearch = async (query: string, scopeActiveOnly: boolean) => {
    if (!query.trim()) {
      onSearchResults?.([]);
      return;
    }

    onSearchStart?.();
    hasSearched.current = true;

    startTransition(async () => {
      try {
        const results = await searchContacts(query, scopeActiveOnly);
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

  const performSearch = () => {
    if (searchTerm.trim()) {
      handleSearch(searchTerm.trim(), activeOnly);
    }
  };

  // Re-runs the search with the NEW scope, but only once a search has already
  // been performed — toggling the box before searching must not fire a query.
  const handleActiveOnlyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setActiveOnly(next);
    if (hasSearched.current && searchTerm.trim()) {
      handleSearch(searchTerm.trim(), next);
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
    hasSearched.current = false;
    onSearchResults?.([]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">Search by name, email, or phone number. Press Enter or click Search.</p>
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
      <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={handleActiveOnlyChange}
          className="rounded border-gray-300"
        />
        {activeOnly ? "Active contacts only" : "Including all contacts"}
      </label>
    </div>
  );
};
