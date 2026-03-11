"use client";

import React from "react";
import Image from "next/image";
import { getDisplayName, getInitials, getImageUrl } from "@/lib/processing-utils";

interface DetailModalPhotoUploadProps {
  imageGuid: string | null;
  mpFileUrl: string | null;
  firstName: string;
  nickname: string | null;
  lastName: string;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  className?: string;
}

export function DetailModalPhotoUpload({
  imageGuid,
  mpFileUrl,
  firstName,
  nickname,
  lastName,
  uploading,
  onUpload,
  photoInputRef,
  className,
}: DetailModalPhotoUploadProps) {
  const displayName = getDisplayName(firstName, nickname);

  return (
    <div
      className={className || "w-14 h-14 rounded-full overflow-hidden relative flex-shrink-0 cursor-pointer group"}
      onClick={() => photoInputRef.current?.click()}
      title={uploading ? "Uploading..." : "Upload photo"}
    >
      {imageGuid && mpFileUrl ? (
        <>
          <Image
            src={getImageUrl(mpFileUrl, imageGuid)}
            alt={`${displayName} ${lastName}`}
            fill
            className="object-cover"
            unoptimized
          />
          {uploading ? (
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
              <span className="text-xs text-white font-medium">...</span>
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-lg font-medium relative">
          {uploading ? (
            <span className="text-xs text-gray-500">...</span>
          ) : (
            <>
              {getInitials(firstName, nickname, lastName)}
              <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
              </div>
            </>
          )}
        </div>
      )}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
        onChange={onUpload}
      />
    </div>
  );
}
