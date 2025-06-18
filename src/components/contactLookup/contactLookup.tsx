'use client';

import React, { useState } from 'react';
import { ContactLookupSearch } from './contactLookupSearch';
import { ContactLookupResults } from './contactLookupResults';
import { contactSearch } from '@/providers/MinistryPlatform/Interfaces/contactInterfaces';

interface ContactLookupProps {
  placeholder?: string;
  disabled?: boolean;
  onContactSelect?: (contact: contactSearch) => void;
  showResultsImmediately?: boolean;
}

export const ContactLookup: React.FC<ContactLookupProps> = ({
  placeholder,
  disabled,
  onContactSelect,
  showResultsImmediately = true
}) => {
  const [searchResults, setSearchResults] = useState<contactSearch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearchResults = (results: contactSearch[]) => {
    setSearchResults(results);
    setIsSearching(false);
    setSearchError('');
    setHasSearched(true);
  };

  const handleSearchError = (error: string) => {
    setSearchError(error);
    setSearchResults([]);
    setIsSearching(false);
    setHasSearched(true);
  };

  const handleSearchStart = () => {
    setIsSearching(true);
    setSearchError('');
    setHasSearched(false);
  };

  const handleContactSelect = (contact: contactSearch) => {
    onContactSelect?.(contact);
    // Optionally clear results after selection
    // setSearchResults([]);
    // setHasSearched(false);
  };

  return (
    <div className="space-y-4">
      <ContactLookupSearch
        placeholder={placeholder}
        disabled={disabled}
        onSearchResults={handleSearchResults}
        onSearchError={handleSearchError}
        onSearchStart={handleSearchStart}
      />
      
      {(showResultsImmediately && (hasSearched || isSearching)) && (
        <ContactLookupResults
          results={searchResults}
          loading={isSearching}
          error={searchError}
          onContactSelect={handleContactSelect}
        />
      )}
    </div>
  );
};

export default ContactLookup;