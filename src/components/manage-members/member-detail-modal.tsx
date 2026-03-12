"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DetailModalPhotoUpload } from "@/components/processing/detail-modal-photo-upload";
import { ContactLinks } from "@/components/processing/contact-links";
import { MilestoneExpandedView } from "@/components/processing/milestone-expanded-view";
import { getDisplayName, formatDate, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE } from "@/lib/processing-utils";
import { fetchMemberDetail, fetchMilestoneFiles, uploadMemberPhoto } from "./actions";
import type { MemberCard, MemberDetail, MemberMilestone, BaseFileInfo } from "@/lib/dto";
import { statusBadgeColor } from "@/lib/contact-badge-utils";

interface MemberDetailModalProps {
  member: MemberCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransition: (member: MemberCard) => void;
  mpFileUrl: string | null;
  onUpdate: () => void;
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

  // Expandable milestone state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [recordFiles, setRecordFiles] = useState<Record<number, BaseFileInfo[]>>({});
  const [filesLoading, setFilesLoading] = useState<number | null>(null);

  const mpBaseOrigin = mpFileUrl ? new URL(mpFileUrl).origin : null;

  useEffect(() => {
    if (!open || !member) {
      setDetail(null);
      setExpandedId(null);
      setRecordFiles({});
      return;
    }

    setLoading(true);
    fetchMemberDetail(member.contactId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [open, member]);

  const handleToggleExpand = useCallback(async (milestoneRecordId: number) => {
    if (expandedId === milestoneRecordId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(milestoneRecordId);

    // Lazily fetch files on first expand
    if (!(milestoneRecordId in recordFiles)) {
      setFilesLoading(milestoneRecordId);
      try {
        const files = await fetchMilestoneFiles(milestoneRecordId);
        setRecordFiles((prev) => ({ ...prev, [milestoneRecordId]: files }));
      } catch {
        setRecordFiles((prev) => ({ ...prev, [milestoneRecordId]: [] }));
      } finally {
        setFilesLoading(null);
      }
    }
  }, [expandedId, recordFiles]);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !member) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return;
    if (file.size > MAX_FILE_SIZE) return;

    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.set("Contact_ID", String(member.contactId));
      formData.set("photo", file);
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
              {mpBaseOrigin && (
                <a
                  href={`${mpBaseOrigin}/mp/355/${m.participantId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View in MP
                </a>
              )}
              {mpBaseOrigin && <span className="text-muted-foreground">&mdash;</span>}
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
                    <MilestoneItem
                      key={ms.participantMilestoneId}
                      milestone={ms}
                      mpBaseOrigin={mpBaseOrigin}
                      expanded={expandedId === ms.participantMilestoneId}
                      files={recordFiles[ms.participantMilestoneId]}
                      filesLoading={filesLoading === ms.participantMilestoneId}
                      onToggle={() => handleToggleExpand(ms.participantMilestoneId)}
                    />
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

interface MilestoneItemProps {
  milestone: MemberMilestone;
  mpBaseOrigin: string | null;
  expanded: boolean;
  files: BaseFileInfo[] | undefined;
  filesLoading: boolean;
  onToggle: () => void;
}

function MilestoneItem({ milestone, mpBaseOrigin, expanded, files, filesLoading, onToggle }: MilestoneItemProps) {
  const hasExpandableContent = milestone.notes || (files && files.length > 0);

  return (
    <div className="rounded-lg border bg-gray-50/50">
      {/* Header row */}
      <div
        className="flex items-start justify-between gap-3 p-3 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{milestone.milestoneName}</span>
            {mpBaseOrigin && (
              <a
                href={`${mpBaseOrigin}/mp/344/${milestone.participantMilestoneId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-blue-600 hover:underline flex-shrink-0 inline-flex items-center gap-0.5"
              >
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7h3a5 5 0 010 10h-3m-6 0H6A5 5 0 016 7h3M8 12h8" />
                </svg>
                MP
              </a>
            )}
          </div>
          {milestone.dateAccomplished && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatDate(milestone.dateAccomplished)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {files && files.length > 0 && (
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
          )}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (hasExpandableContent || filesLoading || files !== undefined) && (
        <MilestoneExpandedView
          notes={milestone.notes}
          files={files}
          filesLoading={filesLoading}
        />
      )}
    </div>
  );
}
