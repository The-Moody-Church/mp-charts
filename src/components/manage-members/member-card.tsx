"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { getDisplayName, getInitials, getImageUrl, formatDate } from "@/lib/processing-utils";
import type { MemberCard as MemberCardType } from "@/lib/dto";
import { statusBadgeColor } from "@/lib/contact-badge-utils";

interface MemberCardProps {
  member: MemberCardType;
  mpFileUrl: string | null;
  onClick: (member: MemberCardType) => void;
}

export function MemberCardComponent({ member, mpFileUrl, onClick }: MemberCardProps) {
  const displayName = getDisplayName(member.firstName, member.nickname);
  const fullName = `${displayName} ${member.lastName}`;
  const showNickname = member.nickname && member.nickname !== member.firstName;

  return (
    <Card
      className="flex flex-col h-full cursor-pointer hover:ring-2 hover:ring-primary/20 transition-shadow"
      onClick={() => onClick(member)}
    >
      <CardContent className="flex flex-col items-center gap-2 p-4 flex-1">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full overflow-hidden relative flex-shrink-0">
          {member.fileUniqueId && mpFileUrl ? (
            <Image
              src={getImageUrl(mpFileUrl, member.fileUniqueId)}
              alt={fullName}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full bg-gray-300 rounded-full flex items-center justify-center font-medium text-gray-600">
              {getInitials(member.firstName, member.nickname, member.lastName)}
            </div>
          )}
        </div>

        {/* Name */}
        <div className="text-center min-w-0 w-full">
          <p className="font-semibold text-sm truncate">{fullName}</p>
          {showNickname && (
            <p className="text-xs text-muted-foreground truncate">
              ({member.firstName})
            </p>
          )}
        </div>

        {/* Status badge */}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeColor(member.memberStatusId)}`}
        >
          {member.memberStatus}
        </span>

        {/* Date joined */}
        {member.dateJoined && (
          <p className="text-xs text-muted-foreground">
            Since {formatDate(member.dateJoined)}
          </p>
        )}

        {/* Contact info */}
        <div className="text-center text-xs text-muted-foreground space-y-0.5 min-w-0 w-full">
          {member.email && <p className="truncate">{member.email}</p>}
          {member.mobilePhone && <p className="truncate">{member.mobilePhone}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
