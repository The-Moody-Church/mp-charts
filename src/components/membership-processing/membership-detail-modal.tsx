"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MembershipCard as MembershipCardData,
  MembershipDetail,
  MembershipMilestoneDetail,
  MembershipMilestoneFileInfo,
} from "@/lib/dto";
import {
  getApplicantDetail,
  createMembershipMilestone,
  updateMembershipMilestone,
  confirmMembershipCompletion,
  getMembershipMilestoneFiles,
  uploadApplicantPhoto,
} from "./actions";
import { useRuntimeConfig } from "@/contexts";

interface MembershipDetailModalProps {
  applicant: MembershipCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

function getDisplayName(firstName: string, nickname: string | null): string {
  return nickname && nickname.trim() ? nickname : firstName;
}

function getInitials(firstName: string, nickname: string | null, lastName: string): string {
  const displayFirst = getDisplayName(firstName, nickname);
  const first = displayFirst?.charAt(0)?.toUpperCase() || "";
  const last = lastName?.charAt(0)?.toUpperCase() || "";
  return first + last;
}

function getImageUrl(baseUrl: string, imageGuid: string): string {
  return `${baseUrl}/${imageGuid}?$thumbnail=true`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ completed }: { completed: boolean }) {
  return completed ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
      Complete
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      Not Started
    </span>
  );
}

export function MembershipDetailModal({
  applicant,
  open,
  onOpenChange,
  onUpdate,
}: MembershipDetailModalProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const [detail, setDetail] = useState<MembershipDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [milestoneNotes, setMilestoneNotes] = useState("");
  const [milestoneDate, setMilestoneDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [recordFiles, setRecordFiles] = useState<Record<number, MembershipMilestoneFileInfo[]>>({});
  const [filesLoading, setFilesLoading] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB

  useEffect(() => {
    if (open && applicant) {
      setLoading(true);
      setDetail(null);
      setExpandedKey(null);
      setRecordFiles({});
      setFileError(null);
      setLinkCopied(false);
      setEditingKey(null);
      setEditError(null);
      setConfirmingCompletion(false);
      getApplicantDetail(
        applicant.info.Contact_ID,
        applicant.info.Participant_ID,
        applicant.info.Group_Participant_ID
      )
        .then((d) => {
          setDetail(d);
          // Pre-fetch files for all milestone records
          if (d?.milestones) {
            for (const m of d.milestones) {
              getMembershipMilestoneFiles(m.Participant_Milestone_ID)
                .then((files) => setRecordFiles((prev) => ({ ...prev, [m.Participant_Milestone_ID]: files })))
                .catch(() => setRecordFiles((prev) => ({ ...prev, [m.Participant_Milestone_ID]: [] })));
            }
          }
        })
        .catch((err) => console.error("Failed to load detail:", err))
        .finally(() => setLoading(false));
    }
  }, [open, applicant]);

  const findMilestoneRecord = (key: string): MembershipMilestoneDetail | null => {
    if (!detail) return null;
    const config = detail.writeBackConfig;
    const milestoneId = config.milestoneIds[key];
    if (!milestoneId) return null;
    return detail.milestones.find(m => m.Milestone_ID === milestoneId) || null;
  };

  const handleToggleExpand = async (key: string) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);

    const milestoneRecord = findMilestoneRecord(key);
    if (milestoneRecord && !(milestoneRecord.Participant_Milestone_ID in recordFiles)) {
      setFilesLoading(milestoneRecord.Participant_Milestone_ID);
      try {
        const files = await getMembershipMilestoneFiles(milestoneRecord.Participant_Milestone_ID);
        setRecordFiles(prev => ({ ...prev, [milestoneRecord.Participant_Milestone_ID]: files }));
      } catch (err) {
        console.error("Failed to load milestone files:", err);
        setRecordFiles(prev => ({ ...prev, [milestoneRecord.Participant_Milestone_ID]: [] }));
      } finally {
        setFilesLoading(null);
      }
    }
  };

  const handleMarkMilestoneComplete = async (milestoneId: number, programId: number) => {
    if (!applicant) return;
    setActionLoading(`milestone-${milestoneId}`);
    try {
      const formData = new FormData();
      formData.set("Participant_ID", String(applicant.info.Participant_ID));
      formData.set("Milestone_ID", String(milestoneId));
      formData.set("Program_ID", String(programId));
      formData.set("Date_Accomplished", new Date(milestoneDate + "T12:00:00").toISOString());
      if (milestoneNotes) {
        formData.set("Notes", milestoneNotes);
      }
      const files = fileInputRef.current?.files;
      if (files) {
        for (const file of Array.from(files)) {
          formData.append("files", file);
        }
      }
      await createMembershipMilestone(formData);
      setMilestoneNotes("");
      setMilestoneDate(new Date().toISOString().split("T")[0]);
      setSelectedMilestoneKey("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUpdate();
      // Refresh detail
      const updated = await getApplicantDetail(
        applicant.info.Contact_ID,
        applicant.info.Participant_ID,
        applicant.info.Group_Participant_ID
      );
      setDetail(updated);
    } catch (err) {
      console.error("Failed to create milestone:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmCompletion = async () => {
    if (!applicant) return;
    setActionLoading("confirm-completion");
    try {
      const formData = new FormData();
      formData.set("Group_Participant_ID", String(applicant.info.Group_Participant_ID));
      const result = await confirmMembershipCompletion(formData);
      if (!result.success) {
        console.error("Failed to confirm membership completion:", result.error);
        return;
      }
      setConfirmingCompletion(false);
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to confirm membership completion:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !applicant) return;

    if (file.size > MAX_FILE_SIZE) {
      setFileError(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 1 MB.`);
      return;
    }

    setPhotoUploading(true);
    setFileError(null);
    try {
      const formData = new FormData();
      formData.set("Contact_ID", String(applicant.info.Contact_ID));
      formData.set("photo", file);
      const result = await uploadApplicantPhoto(formData);
      if (!result.success) {
        setFileError(result.error || "Upload failed");
        return;
      }
      const updated = await getApplicantDetail(
        applicant.info.Contact_ID,
        applicant.info.Participant_ID,
        applicant.info.Group_Participant_ID
      );
      setDetail(updated);
      onUpdate();
    } catch (err) {
      console.error("Photo upload failed:", err);
      setFileError("Failed to upload photo");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleStartEdit = (key: string) => {
    const milestoneRecord = findMilestoneRecord(key);
    if (milestoneRecord) {
      setEditDate(milestoneRecord.Date_Accomplished ? milestoneRecord.Date_Accomplished.split("T")[0] : "");
      setEditNotes(milestoneRecord.Notes || "");
    }
    setEditError(null);
    setEditingKey(key);
    setExpandedKey(key);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditError(null);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  const handleSaveEdit = async () => {
    if (!editingKey || !applicant) return;
    setEditSaving(true);
    setEditError(null);

    try {
      const milestoneRecord = findMilestoneRecord(editingKey);
      if (!milestoneRecord) {
        setEditError("Milestone record not found");
        setEditSaving(false);
        return;
      }

      const editFiles: File[] = [];
      if (editFileInputRef.current?.files) {
        for (const file of Array.from(editFileInputRef.current.files)) {
          if (file.size > MAX_FILE_SIZE) {
            setEditError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 1 MB.`);
            setEditSaving(false);
            return;
          }
          editFiles.push(file);
        }
      }

      const formData = new FormData();
      formData.set("Participant_Milestone_ID", String(milestoneRecord.Participant_Milestone_ID));
      if (editDate) formData.set("Date_Accomplished", new Date(editDate + "T12:00:00").toISOString());
      formData.set("Notes", editNotes);
      for (const file of editFiles) formData.append("files", file);
      const result = await updateMembershipMilestone(formData);
      if (!result.success) {
        setEditError(result.error || "Update failed");
        setEditSaving(false);
        return;
      }

      const updated = await getApplicantDetail(
        applicant.info.Contact_ID,
        applicant.info.Participant_ID,
        applicant.info.Group_Participant_ID
      );
      setDetail(updated);

      if (editFiles.length > 0) {
        const freshFiles = await getMembershipMilestoneFiles(milestoneRecord.Participant_Milestone_ID);
        setRecordFiles(prev => ({ ...prev, [milestoneRecord.Participant_Milestone_ID]: freshFiles }));
      }

      setEditingKey(null);
      if (editFileInputRef.current) editFileInputRef.current.value = "";
      onUpdate();
    } catch (err) {
      console.error("Failed to save edit:", err);
      setEditError("Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  };

  if (!applicant) return null;

  const { info } = applicant;
  const displayName = getDisplayName(info.First_Name, info.Nickname);
  const checklist = detail?.checklist || applicant.checklist;
  const currentImageGuid = detail?.info.Image_GUID ?? info.Image_GUID;
  const mpBaseOrigin = mpFileUrl ? new URL(mpFileUrl).origin : null;
  const mpParticipantUrl = mpBaseOrigin ? `${mpBaseOrigin}/mp/355/${info.Participant_ID}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full overflow-hidden relative flex-shrink-0 cursor-pointer group"
              onClick={() => photoInputRef.current?.click()}
              title={photoUploading ? "Uploading..." : "Upload photo"}
            >
              {currentImageGuid && mpFileUrl ? (
                <>
                  <Image
                    src={getImageUrl(mpFileUrl, currentImageGuid)}
                    alt={`${displayName} ${info.Last_Name}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {photoUploading ? (
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
                  {photoUploading ? (
                    <span className="text-xs text-gray-500">...</span>
                  ) : (
                    <>
                      {getInitials(info.First_Name, info.Nickname, info.Last_Name)}
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
                onChange={handlePhotoUpload}
              />
            </div>
            <div>
              <DialogTitle>
                {displayName} {info.Last_Name}
              </DialogTitle>
              <DialogDescription>
                Applicant since {formatDate(info.Start_Date)}
                {mpParticipantUrl && (
                  <>
                    {" — "}
                    <a
                      href={mpParticipantUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View in MP
                    </a>
                  </>
                )}
                {" — "}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/membership-processing?applicant=${info.Group_Participant_ID}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    } catch {
                      console.error("Failed to copy link");
                    }
                  }}
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {linkCopied ? (
                    <span className="text-green-600">Copied!</span>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                      </svg>
                      Copy Link
                    </>
                  )}
                </button>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Confirm Membership Completion action bar */}
        {!loading && detail && (
          <div className="flex items-center justify-end gap-2 -mt-2">
            {!confirmingCompletion ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmingCompletion(true)}
                className="text-xs border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
              >
                Confirm Membership Completion
              </Button>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Remove from processing group?</span>
                <Button
                  size="sm"
                  onClick={handleConfirmCompletion}
                  disabled={actionLoading === "confirm-completion"}
                  className="text-xs bg-green-600 hover:bg-green-700"
                >
                  {actionLoading === "confirm-completion" ? "Completing..." : "Yes, Confirm"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmingCompletion(false)}
                  disabled={actionLoading === "confirm-completion"}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading applicant details...
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* Contact Info */}
            {(info.Email_Address || info.Mobile_Phone) && (
              <div className="flex flex-wrap gap-2">
                {info.Email_Address && (
                  <a
                    href={`mailto:${info.Email_Address}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    {info.Email_Address}
                  </a>
                )}
                {info.Mobile_Phone && (
                  <a
                    href={`tel:${info.Mobile_Phone}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    {info.Mobile_Phone}
                  </a>
                )}
              </div>
            )}

            {/* Checklist detail */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Milestones</h3>
              {checklist.map((item) => {
                const milestoneRecord = findMilestoneRecord(item.key);
                const isExpanded = expandedKey === item.key;
                const hasExpandableContent = !!milestoneRecord;
                const isEditing = editingKey === item.key;
                const isEditable = hasExpandableContent;

                const expandRecordId = milestoneRecord?.Participant_Milestone_ID ?? null;
                const files = expandRecordId ? recordFiles[expandRecordId] : undefined;
                const isLoadingFiles = expandRecordId !== null && filesLoading === expandRecordId;

                const mpRecordUrl = mpBaseOrigin && milestoneRecord
                  ? `${mpBaseOrigin}/mp/344/${milestoneRecord.Participant_Milestone_ID}`
                  : null;

                return (
                  <div key={item.key} className="rounded-lg border bg-gray-50/50 overflow-hidden">
                    <div
                      className={`flex items-start justify-between gap-3 p-3 ${hasExpandableContent ? "cursor-pointer hover:bg-gray-100/50" : ""}`}
                      onClick={hasExpandableContent ? () => handleToggleExpand(item.key) : undefined}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{item.label}</span>
                          {files && files.length > 0 && (
                            <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          )}
                          {mpRecordUrl && (
                            <a
                              href={mpRecordUrl}
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
                          <StatusBadge completed={item.completed} />
                          {isEditable && !isEditing && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStartEdit(item.key); }}
                              className="p-0.5 rounded hover:bg-gray-200 transition-colors"
                              title="Edit"
                            >
                              <svg className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                          )}
                          {hasExpandableContent && !isEditing && (
                            <svg
                              className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </div>
                        {item.date && (
                          <p className="text-xs text-muted-foreground">
                            Date: {formatDate(item.date)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Edit mode */}
                    {isEditing && (
                      <div className="px-3 pb-3 border-t bg-blue-50/50 space-y-2">
                        <div className="pt-2 flex items-center gap-2">
                          <div className="flex-1">
                            <Label className="text-xs">Date</Label>
                            <Input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="text-xs h-8"
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">Notes</Label>
                            <Textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="text-xs"
                              rows={2}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Add File</Label>
                          <Input
                            type="file"
                            ref={editFileInputRef}
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            className="text-xs h-8"
                          />
                        </div>
                        {files && files.length > 0 && (
                          <div className="pt-1">
                            <p className="text-xs font-medium text-gray-700 mb-1">Existing Attachments</p>
                            <div className="space-y-1">
                              {files.map((file) => (
                                <a
                                  key={file.fileId}
                                  href={file.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline block truncate"
                                >
                                  {file.fileName}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {editError && (
                          <p className="text-xs text-red-600">{editError}</p>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" onClick={handleSaveEdit} disabled={editSaving} className="text-xs h-7 px-3">
                            {editSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={editSaving} className="text-xs h-7 px-3">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Expanded content — read-only view */}
                    {isExpanded && hasExpandableContent && !isEditing && (
                      <div className="px-3 pb-3 border-t bg-white space-y-2">
                        {milestoneRecord?.Notes && (
                          <div className="pt-2">
                            <p className="text-xs font-medium text-gray-700 mb-0.5">Notes</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {milestoneRecord.Notes}
                            </p>
                          </div>
                        )}

                        <div className="pt-1">
                          <p className="text-xs font-medium text-gray-700 mb-1">Attachments</p>
                          {isLoadingFiles ? (
                            <p className="text-xs text-muted-foreground">Loading files...</p>
                          ) : files && files.length > 0 ? (
                            <div className="space-y-1.5">
                              {files.map((file) => (
                                <div key={file.fileId} className="flex items-center gap-2">
                                  {file.isPdf ? (
                                    <svg className="h-4 w-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                  ) : file.isImage ? (
                                    <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                                    </svg>
                                  ) : (
                                    <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                  )}
                                  <a
                                    href={file.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline truncate"
                                  >
                                    {file.fileName}
                                  </a>
                                </div>
                              ))}
                            </div>
                          ) : files ? (
                            <p className="text-xs text-muted-foreground">No attachments</p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Actions: Create Milestone */}
            <div className="space-y-2 pt-2 border-t">
              <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
              <div className="space-y-2">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="milestone-notes" className="text-xs">Notes (optional)</Label>
                    <Textarea
                      id="milestone-notes"
                      value={milestoneNotes}
                      onChange={(e) => setMilestoneNotes(e.target.value)}
                      placeholder="Add notes for the milestone..."
                      className="text-xs"
                      rows={2}
                    />
                  </div>
                  <div className="w-36">
                    <Label htmlFor="milestone-date" className="text-xs">Date</Label>
                    <Input
                      id="milestone-date"
                      type="date"
                      value={milestoneDate}
                      onChange={(e) => setMilestoneDate(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="file-upload" className="text-xs">Attachment (optional)</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.size > MAX_FILE_SIZE) {
                        setFileError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 1 MB.`);
                      } else {
                        setFileError(null);
                      }
                    }}
                  />
                  {fileError && (
                    <p className="text-xs text-red-600 mt-1">{fileError}</p>
                  )}
                </div>
                {(() => {
                  const availableItems = detail?.writeBackConfig
                    ? checklist.filter((item) => item.status === "not_started")
                    : [];
                  if (availableItems.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        All milestones are complete.
                      </p>
                    );
                  }
                  const selectedMilestoneId = selectedMilestoneKey && detail?.writeBackConfig
                    ? detail.writeBackConfig.milestoneIds[selectedMilestoneKey] ?? null
                    : null;
                  const programId = detail?.writeBackConfig?.programId;
                  const canSubmit = !!selectedMilestoneId && !!programId;
                  return (
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label htmlFor="milestone-select" className="text-xs">Milestone</Label>
                        <select
                          id="milestone-select"
                          value={selectedMilestoneKey}
                          onChange={(e) => setSelectedMilestoneKey(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="">Select a milestone...</option>
                          {availableItems.map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (selectedMilestoneId && programId) {
                            handleMarkMilestoneComplete(selectedMilestoneId, programId);
                          }
                        }}
                        disabled={!canSubmit || actionLoading !== null || !!fileError}
                      >
                        {actionLoading ? "Saving..." : "Mark Complete"}
                      </Button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
