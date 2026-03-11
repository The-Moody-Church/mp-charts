"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDisplayName, getInitials, getImageUrl } from "@/lib/processing-utils";
import type { MemberCard as MemberCardType } from "@/lib/dto";

interface MemberCardProps {
  member: MemberCardType;
  mpFileUrl: string | null;
  onTransition: (member: MemberCardType) => void;
}

function statusBadgeColor(statusId: number): string {
  switch (statusId) {
    case 1: return "bg-green-100 text-green-800";
    case 4: return "bg-blue-100 text-blue-800";
    case 10: return "bg-purple-100 text-purple-800";
    case 5: case 6: case 7: case 8: case 9:
      return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

export function MemberCardComponent({ member, mpFileUrl, onTransition }: MemberCardProps) {
  const displayName = getDisplayName(member.firstName, member.nickname);
  const fullName = `${displayName} ${member.lastName}`;
  const showNickname = member.nickname && member.nickname !== member.firstName;

  return (
    <Card className="flex flex-col h-full">
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

        {/* Contact info */}
        <div className="text-center text-xs text-muted-foreground space-y-0.5 min-w-0 w-full">
          {member.email && <p className="truncate">{member.email}</p>}
          {member.mobilePhone && <p className="truncate">{member.mobilePhone}</p>}
        </div>

        {/* Transition button */}
        <div className="mt-auto pt-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => onTransition(member)}
          >
            Change Status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
