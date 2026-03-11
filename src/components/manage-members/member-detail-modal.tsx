"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DetailModalPhotoUpload } from "@/components/processing/detail-modal-photo-upload";
import { ContactLinks } from "@/components/processing/contact-links";
import { getDisplayName, formatDate, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE } from "@/lib/processing-utils";
import { fetchMemberDetail, uploadMemberPhoto } from "./actions";
import type { MemberCard, MemberDetail, MemberMilestone } from "@/lib/dto";

interface MemberDetailModalProps {
  member: MemberCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransition: (member: MemberCard) => void;
  mpFileUrl: string | null;
  onUpdate: () => void;
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

export function MemberDetailModal({
  member,
  open,
  onOpenChange,
  onTransition,
  mpFileUrl,
  onUpdate,
}: MemberDetailModalProps) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !member) {
      setDetail(null);
      return;
    }

    setLoading(true);
    fetchMemberDetail(member.contactId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [open, member]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !member) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return;
    if (file.size > MAX_FILE_SIZE) return;

    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.set("Contact_ID", String(member.contactId));
      formData.set("file", file);
      await uploadMemberPhoto(formData);
      onUpdate();
    } catch {
      // Silently fail — photo upload is non-critical
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function handleCopyLink() {
    if (!member) return;
    const url = `${window.location.origin}/manage-members?member=${member.contactId}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const displayName = member
    ? getDisplayName(member.firstName, member.nickname)
    : "";
  const fullName = member ? `${displayName} ${member.lastName}` : "";
  const showNickname = member?.nickname && member.nickname !== member.firstName;

  // Use detail's member data if loaded (may be fresher), else fall back to prop
  const m = detail?.member ?? member;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Member Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : m ? (
          <div className="space-y-4">
            {/* Header: photo + name + status */}
            <div className="flex items-start gap-4">
              <DetailModalPhotoUpload
                imageGuid={m.fileUniqueId}
                mpFileUrl={mpFileUrl}
                firstName={m.firstName}
                nickname={m.nickname}
                lastName={m.lastName}
                uploading={photoUploading}
                onUpload={handlePhotoUpload}
                photoInputRef={photoInputRef}
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-lg leading-tight truncate">
                  {fullName}
                </p>
                {showNickname && (
                  <p className="text-sm text-muted-foreground">
                    ({member!.firstName})
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeColor(m.memberStatusId)}`}
                  >
                    {m.memberStatus}
                  </span>
                  {m.dateJoined && (
                    <span className="text-xs text-muted-foreground">
                      Member since {formatDate(m.dateJoined)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contact links */}
            <ContactLinks email={m.email} phone={m.mobilePhone} showSms />

            {/* Links: View in MP + Copy Link */}
            <div className="flex flex-wrap items-center gap-1 text-sm">
              {mpFileUrl && (
                <a
                  href={`${new URL(mpFileUrl).origin}/mp/355/${m.participantId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View in MP
                </a>
              )}
              {mpFileUrl && <span className="text-muted-foreground">&mdash;</span>}
              <button
                onClick={handleCopyLink}
                className="text-blue-600 hover:underline"
              >
                {linkCopied ? "Copied!" : "Copy Link"}
              </button>
            </div>

            {/* Membership Milestones */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Membership History</h3>
              {detail?.milestones && detail.milestones.length > 0 ? (
                <div className="space-y-2">
                  {detail.milestones.map((ms) => (
                    <MilestoneItem key={ms.participantMilestoneId} milestone={ms} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {loading ? "Loading..." : "No membership milestones recorded."}
                </p>
              )}
            </div>

            {/* Action: Change Status */}
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  if (member) onTransition(member);
                }}
              >
                Change Status
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MilestoneItem({ milestone }: { milestone: MemberMilestone }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{milestone.milestoneName}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {formatDate(milestone.dateAccomplished)}
        </span>
      </div>
      {milestone.notes && (
        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
          {milestone.notes}
        </p>
      )}
    </div>
  );
}
