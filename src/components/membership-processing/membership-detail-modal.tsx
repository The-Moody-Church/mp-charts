"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  MembershipCard as MembershipCardData,
  MembershipDetail,
  MembershipMilestoneDetail,
  MembershipMilestoneFileInfo,
} from "@/lib/dto";
import { getDisplayName, formatDate, MAX_FILE_SIZE } from "@/lib/processing-utils";
import {
  DetailModalPhotoUpload,
  ContactLinks,
  MilestoneExpandedView,
  MilestoneEditForm,
  QuickActionsPanel,
} from "@/components/processing";
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
            <DetailModalPhotoUpload
              imageGuid={currentImageGuid}
              mpFileUrl={mpFileUrl}
              firstName={info.First_Name}
              nickname={info.Nickname}
              lastName={info.Last_Name}
              uploading={photoUploading}
              onUpload={handlePhotoUpload}
              photoInputRef={photoInputRef}
            />
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
            <ContactLinks email={info.Email_Address} phone={info.Mobile_Phone} />

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
                      <MilestoneEditForm
                        editDate={editDate}
                        onEditDateChange={setEditDate}
                        editNotes={editNotes}
                        onEditNotesChange={setEditNotes}
                        editFileInputRef={editFileInputRef}
                        existingFiles={files}
                        error={editError}
                        saving={editSaving}
                        onSave={handleSaveEdit}
                        onCancel={handleCancelEdit}
                      />
                    )}

                    {/* Expanded content — read-only view */}
                    {isExpanded && hasExpandableContent && !isEditing && (
                      <MilestoneExpandedView
                        notes={milestoneRecord?.Notes ?? null}
                        files={files}
                        filesLoading={isLoadingFiles}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Actions: Create Milestone */}
            {(() => {
              const availableItems = detail?.writeBackConfig
                ? checklist.filter((item) => item.status === "not_started")
                : [];
              const selectedMilestoneId = selectedMilestoneKey && detail?.writeBackConfig
                ? detail.writeBackConfig.milestoneIds[selectedMilestoneKey] ?? null
                : null;
              const programId = detail?.writeBackConfig?.programId;
              return (
                <QuickActionsPanel
                  availableItems={availableItems}
                  selectedKey={selectedMilestoneKey}
                  onSelectedKeyChange={setSelectedMilestoneKey}
                  date={milestoneDate}
                  onDateChange={setMilestoneDate}
                  notes={milestoneNotes}
                  onNotesChange={setMilestoneNotes}
                  fileInputRef={fileInputRef}
                  fileError={fileError}
                  onFileError={setFileError}
                  canSubmit={!!selectedMilestoneId && !!programId}
                  submitting={actionLoading !== null}
                  onSubmit={() => {
                    if (selectedMilestoneId && programId) {
                      handleMarkMilestoneComplete(selectedMilestoneId, programId);
                    }
                  }}
                />
              );
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
