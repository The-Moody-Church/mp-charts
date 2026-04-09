"use client";

import { useState } from "react";
import Image from "next/image";
import { getDisplayName, getInitials, getImageUrl } from "@/lib/processing-utils";

interface PersonAvatarProps {
  imageGuid: string | null;
  mpFileUrl: string | null;
  firstName: string;
  nickname: string | null;
  lastName: string;
  /** "sm" = 14x14 (modal header), "md" = 16x16 (card) */
  size?: "sm" | "md";
}

export function PersonAvatar({
  imageGuid,
  mpFileUrl,
  firstName,
  nickname,
  lastName,
  size = "md",
}: PersonAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const displayName = getDisplayName(firstName, nickname);
  const sizeClass = size === "sm" ? "w-14 h-14" : "w-16 h-16";
  const textClass = size === "sm" ? "text-lg" : "text-lg";

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden relative flex-shrink-0`}>
      {imageGuid && mpFileUrl && !imgError ? (
        <Image
          src={getImageUrl(mpFileUrl, imageGuid)}
          alt={`${displayName} ${lastName}`}
          fill
          className="object-cover"
          unoptimized
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`w-full h-full bg-gray-300 rounded-full flex items-center justify-center text-gray-600 ${textClass} font-medium`}>
          {getInitials(firstName, nickname, lastName)}
        </div>
      )}
    </div>
  );
}
