"use server";

import { requireSession, getMpUserId } from "@/lib/auth-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ALLOWED_IMAGE_TYPES, ALLOWED_DOCUMENT_TYPES, MAX_FILE_SIZE } from "@/lib/processing-utils";

/**
 * Extract and validate files from FormData.
 * Returns validated File array or throws on invalid file type.
 */
export async function extractValidatedFiles(
  formData: FormData,
  fieldName: string = "files",
  allowedTypes: string[] = ALLOWED_DOCUMENT_TYPES,
): Promise<File[]> {
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === fieldName && value instanceof File && value.size > 0) {
      if (!allowedTypes.includes(value.type)) {
        throw new Error(`Invalid file type: ${value.type}. Allowed: JPEG, PNG, GIF, WebP, PDF`);
      }
      files.push(value);
    }
  }
  return files;
}

/**
 * Extract and validate files from FormData, returning an error result instead of throwing.
 * Suitable for update actions that return { success, error } results.
 */
export async function extractValidatedFilesResult(
  formData: FormData,
  fieldName: string = "files",
  allowedTypes: string[] = ALLOWED_DOCUMENT_TYPES,
): Promise<{ files: File[] } | { error: string }> {
  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === fieldName && value instanceof File && value.size > 0) {
      if (!allowedTypes.includes(value.type)) {
        return { error: `Invalid file type: ${value.type}. Allowed: JPEG, PNG, GIF, WebP, PDF` };
      }
      files.push(value);
    }
  }
  return { files };
}

/** Interface for services that support photo upload. */
interface PhotoUploadService {
  uploadContactPhoto: (contactId: number, file: File, userId: number | undefined) => Promise<void>;
}

/**
 * Generic photo upload for any service that exposes uploadContactPhoto().
 * Each feature passes its own service factory to avoid tight coupling.
 */
export async function uploadContactPhoto(
  formData: FormData,
  getService: () => Promise<PhotoUploadService>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    enforceRateLimit(session.user.id, "upload");

    const contactId = Number(formData.get("Contact_ID"));
    if (!contactId || isNaN(contactId)) {
      return { success: false, error: "Invalid Contact_ID" };
    }

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "No file provided" };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 20 MB.` };
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { success: false, error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" };
    }

    const userId = getMpUserId(session);
    const service = await getService();
    await service.uploadContactPhoto(contactId, file, userId);
    return { success: true };
  } catch (error) {
    console.error("Error uploading photo:", error);
    return { success: false, error: "Failed to upload photo" };
  }
}
