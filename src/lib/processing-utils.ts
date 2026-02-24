/**
 * Shared utility functions and constants for processing features
 * (volunteer, baptism, membership).
 */

/** Display name: prefer nickname if present, else first name. */
export function getDisplayName(firstName: string, nickname: string | null): string {
  return nickname && nickname.trim() ? nickname : firstName;
}

/** Two-letter initials from display name + last name. */
export function getInitials(firstName: string, nickname: string | null, lastName: string): string {
  const displayFirst = getDisplayName(firstName, nickname);
  const first = displayFirst?.charAt(0)?.toUpperCase() || "";
  const last = lastName?.charAt(0)?.toUpperCase() || "";
  return first + last;
}

/** Ministry Platform thumbnail URL for a given file GUID. */
export function getImageUrl(baseUrl: string, imageGuid: string): string {
  return `${baseUrl}/${imageGuid}?$thumbnail=true`;
}

/** Format a date string as "Mon D, YYYY" or em-dash for null. */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Allowed MIME types for photo uploads. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Allowed MIME types for document uploads (images + PDF). */
export const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];

/** Maximum file size for uploads (1 MB). */
export const MAX_FILE_SIZE = 1 * 1024 * 1024;
