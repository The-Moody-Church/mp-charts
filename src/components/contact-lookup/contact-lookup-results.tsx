"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ContactSearch } from "@/lib/dto";
import { useRuntimeConfig } from "@/contexts";
import { statusBadgeColor } from "@/lib/contact-badge-utils";

const PAGE_SIZE = 15;

interface ContactLookupResultsProps {
  results: ContactSearch[];
  loading?: boolean;
  error?: string;
  onContactSelect?: (contact: ContactSearch) => void;
}

export const ContactLookupResults: React.FC<ContactLookupResultsProps> = ({
  results,
  loading = false,
  error,
  onContactSelect,
}) => {
  const router = useRouter();
  const { mpFileUrl } = useRuntimeConfig();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when results change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [results]);

  // IntersectionObserver to load more results when user scrolls near bottom
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || visibleCount >= results.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, results.length));
        }
      },
      { root: container, rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, results.length]);

  const handleContactClick = (contact: ContactSearch) => {
    onContactSelect?.(contact);
    if (contact.Contact_GUID) {
      router.push(`/contact-lookup/${contact.Contact_GUID}`);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500">Searching contacts...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500 bg-red-50 rounded-md">
        Error: {error}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">No contacts found</div>
    );
  }

  const getDisplayName = (firstName?: string, nickname?: string) => {
    return nickname && nickname.trim() ? nickname : firstName;
  };

  const getInitials = (
    firstName?: string,
    nickname?: string,
    lastName?: string
  ) => {
    const displayFirstName = getDisplayName(firstName, nickname);
    const first = displayFirstName?.charAt(0)?.toUpperCase() || "";
    const last = lastName?.charAt(0)?.toUpperCase() || "";
    return first + last;
  };

  const getImageUrl = (imageGuid: string) => {
    return `${mpFileUrl}/${imageGuid}?$thumbnail=true`;
  };

  const visibleResults = results.slice(0, visibleCount);

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
        {results.length} contact{results.length !== 1 ? "s" : ""} found
      </div>
      <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto">
        {visibleResults.map((contact) => (
          <div
            key={contact.Contact_ID}
            className="p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => handleContactClick(contact)}
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden relative">
                {contact.Image_GUID && mpFileUrl ? (
                  <Image
                    src={getImageUrl(contact.Image_GUID)}
                    alt={`${getDisplayName(
                      contact.First_Name,
                      contact.Nickname
                    )} ${contact.Last_Name}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-sm font-medium">
                    {getInitials(
                      contact.First_Name,
                      contact.Nickname,
                      contact.Last_Name
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {getDisplayName(contact.First_Name, contact.Nickname)}{" "}
                    {contact.Last_Name}
                  </span>
                  {contact.Member_Status && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeColor(contact.Member_Status_ID)}`}>
                      {contact.Member_Status}
                    </span>
                  )}
                </div>
                {contact.Email_Address && (
                  <div className="text-sm text-gray-600 truncate">
                    {contact.Email_Address}
                  </div>
                )}
                {contact.Mobile_Phone && (
                  <div className="text-sm text-gray-600">
                    {contact.Mobile_Phone}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {/* Sentinel element for infinite scroll */}
        {visibleCount < results.length && (
          <div ref={sentinelRef} className="p-2 text-center text-sm text-muted-foreground">
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
};
