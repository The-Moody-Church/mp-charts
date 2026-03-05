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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BaptismCard as BaptismCardData, BaptismDetail, BaptismChecklistItem, BaptismMilestoneFileInfo, BaptismMilestoneDetail } from "@/lib/dto";
import { getDisplayName, formatDate, MAX_FILE_SIZE } from "@/lib/processing-utils";
import {
  DetailModalPhotoUpload,
  ContactLinks,
  MilestoneExpandedView,
  MilestoneEditForm,
  QuickActionsPanel,
  QuickActionButton,
} from "@/components/processing";
import {
  getApplicantDetail,
  createBaptismMilestone,
  updateBaptismMilestone,
  getBaptismMilestoneFiles,
  uploadApplicantPhoto,
  pauseApplicant,
  resumeApplicant,
} from "./actions";
import { useRuntimeConfig } from "@/contexts";

interface BaptismDetailModalProps {
  applicant: BaptismCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  isCurrentTab?: boolean;
}


function StatusBadge({ item }: { item: BaptismChecklistItem }) {
  if (item.status === "complete") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      Not Started
    </span>
  );
}

export function BaptismDetailModal({
  applicant,
  open,
  onOpenChange,
  onUpdate,
  isCurrentTab,
}: BaptismDetailModalProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const [detail, setDetail] = useState<BaptismDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [milestoneNotes, setMilestoneNotes] = useState("");
  const [milestoneDate, setMilestoneDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [recordFiles, setRecordFiles] = useState<Record<number, BaptismMilestoneFileInfo[]>>({});
  const [filesLoading, setFilesLoading] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [pauseNotes, setPauseNotes] = useState("");
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [quickActionExpanded, setQuickActionExpanded] = useState(false);
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
      setShowPauseConfirm(false);
      setShowResumeConfirm(false);
      setQuickActionExpanded(false);
      setPauseNotes("");
      getApplicantDetail(
        applicant.info.Contact_ID,
        applicant.info.Participant_ID,
        applicant.info.Group_Participant_ID!
      )
        .then((d) => {
          setDetail(d);
          if (d?.milestones) {
            for (const m of d.milestones) {
              getBaptismMilestoneFiles(m.Participant_Milestone_ID)
                .then((files) => setRecordFiles((prev) => ({ ...prev, [m.Participant_Milestone_ID]: files })))
                .catch(() => setRecordFiles((prev) => ({ ...prev, [m.Participant_Milestone_ID]: [] })));
            }
          }
        })
        .catch((err) => console.error("Failed to load detail:", err))
        .finally(() => setLoading(false));
    }
  }, [open, applicant]);

  const findMilestoneRecord = (key: string): BaptismMilestoneDetail | null => {
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
        const files = await getBaptismMilestoneFiles(milestoneRecord.Participant_Milestone_ID);
        setRecordFiles(prev => ({ ...prev, [milestoneRecord.Participant_Milestone_ID]: files }));
      } catch {
        setRecordFiles(prev => ({ ...prev, [milestoneRecord.Participant_Milestone_ID]: [] }));
      } finally {
        setFilesLoading(null);
      }
    }
  };

  const handleMarkMilestoneComplete = async () => {
    if (!applicant || !selectedMilestoneKey || !detail) return;

    const milestoneId = detail.writeBackConfig.milestoneIds[selectedMilestoneKey];
    const programId = detail.writeBackConfig.programId;
    if (!milestoneId || !programId) return;

    setActionLoading(`milestone-${milestoneId}`);
    try {
      const formData = new FormData();
      formData.set("Participant_ID", String(applicant.info.Participant_ID));
      formData.set("Milestone_ID", String(milestoneId));
      formData.set("Program_ID", String(programId));
      formData.set("Date_Accomplished", milestoneDate + "T12:00:00");
      if (milestoneNotes) {
        formData.set("Notes", milestoneNotes);
      }
      const files = fileInputRef.current?.files;
      if (files) {
        for (const file of Array.from(files)) {
          formData.append("files", file);
        }
      }
      await createBaptismMilestone(formData);
      setMilestoneNotes("");
      setMilestoneDate(new Date().toISOString().split("T")[0]);
      setSelectedMilestoneKey("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUpdate();
      const updated = await getApplicantDetail(
        applicant.info.Contact_ID,
        applicant.info.Participant_ID,
        applicant.info.Group_Participant_ID!
      );
      setDetail(updated);
    } catch (err) {
      console.error("Failed to create milestone:", err);
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
        applicant.info.Group_Participant_ID!
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

  const handlePause = async () => {
    if (!applicant) return;
    setActionLoading("pause");
    try {
      const formData = new FormData();
      formData.set("Participant_ID", String(applicant.info.Participant_ID));
      formData.set("Group_Participant_ID", String(applicant.info.Group_Participant_ID!));
      if (pauseNotes) formData.set("Notes", pauseNotes);
      const result = await pauseApplicant(formData);
      if (!result.success) {
        setFileError(result.error || "Pause failed");
        return;
      }
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      console.error("Pause failed:", err);
      setFileError("Failed to pause applicant");
    } finally {
      setActionLoading(null);
      setShowPauseConfirm(false);
    }
  };

  const handleResume = async () => {
    if (!applicant) return;
    setActionLoading("resume");
    try {
      const formData = new FormData();
      formData.set("Participant_ID", String(applicant.info.Participant_ID));
      formData.set("Group_Participant_ID", String(applicant.info.Group_Participant_ID!));
      const result = await resumeApplicant(formData);
      if (!result.success) {
        setFileError(result.error || "Resume failed");
        return;
      }
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      console.error("Resume failed:", err);
      setFileError("Failed to resume applicant");
    } finally {
      setActionLoading(null);
      setShowResumeConfirm(false);
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
        setEditError("No record found to update");
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
      if (editDate) formData.set("Date_Accomplished", editDate + "T12:00:00");
      formData.set("Notes", editNotes);
      for (const file of editFiles) formData.append("files", file);

      const result = await updateBaptismMilestone(formData);
      if (!result.success) {
        setEditError(result.error || "Update failed");
        setEditSaving(false);
        return;
      }

      const updated = await getApplicantDetail(
        applicant.info.Contact_ID,
        applicant.info.Participant_ID,
        applicant.info.Group_Participant_ID!
      );
      setDetail(updated);

      if (editFiles.length > 0) {
        const freshFiles = await getBaptismMilestoneFiles(milestoneRecord.Participant_Milestone_ID);
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

  const handleCopyLink = () => {
    if (!applicant) return;
    const url = `${window.location.origin}/baptism-processing?applicant=${applicant.info.Group_Participant_ID!}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (!applicant) return null;

  const { info } = applicant;
  const displayName = getDisplayName(info.First_Name, info.Nickname);
  const checklist = detail?.checklist || applicant.checklist;
  const currentImageGuid = detail?.info.Image_GUID ?? info.Image_GUID;
  const mpBaseOrigin = mpFileUrl ? new URL(mpFileUrl).origin : null;
  const mpParticipantUrl = mpBaseOrigin ? `${mpBaseOrigin}/mp/355/${info.Participant_ID}` : null;

  // Interview completed but not yet approved — show approval/pause decision
  const interviewComplete = checklist.find(c => c.key === "completed_interview")?.completed ?? false;
  const approvedComplete = checklist.find(c => c.key === "approved")?.completed ?? false;
  const showApprovalDecision = isCurrentTab && interviewComplete && !approvedComplete;

  // Paused tab — show resume button
  const showResumeButton = !isCurrentTab && applicant.isPaused;

  // Available milestones for quick action dropdown
  const availableMilestones = checklist.filter(item => item.status === "not_started");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
                Applied {formatDate(info.Start_Date)}
                {mpParticipantUrl && (
                  <>
                    {" \u2014 "}
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
                {" \u2014 "}
                <button
                  onClick={handleCopyLink}
                  className="text-blue-600 hover:underline"
                >
                  {linkCopied ? "Copied!" : "Copy Link"}
                </button>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Contact info — show immediately from card data, prefer detail when loaded */}
        <ContactLinks
          email={(detail?.info ?? info).Email_Address}
          phone={(detail?.info ?? info).Mobile_Phone}
        />

        {/* End date alert */}
        {(detail?.endDate || applicant.endDate) && (
          <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 p-2.5 text-sm text-orange-800">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            Group membership ends {formatDate(detail?.endDate ?? applicant.endDate)}
          </div>
        )}

        {fileError && (
          <div className="text-sm text-red-600 bg-red-50 rounded-md p-2">
            {fileError}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading details...</div>
        ) : (
          <div className="space-y-4">
            {/* Approval/Pause Decision — after interview completed, before approved */}
            {showApprovalDecision && detail && (
              <div className="space-y-2 rounded-lg border bg-blue-50/50 p-3">
                <h3 className="text-sm font-semibold text-blue-900">Baptism Decision</h3>
                <p className="text-xs text-blue-800">Interview is complete. Choose an action:</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={!!actionLoading}
                    onClick={async () => {
                      const milestoneId = detail.writeBackConfig.milestoneIds["approved"];
                      const programId = detail.writeBackConfig.programId;
                      if (!milestoneId || !programId) return;
                      setActionLoading("approve");
                      try {
                        const formData = new FormData();
                        formData.set("Participant_ID", String(applicant.info.Participant_ID));
                        formData.set("Milestone_ID", String(milestoneId));
                        formData.set("Program_ID", String(programId));
                        formData.set("Date_Accomplished", new Date().toLocaleString('sv-SE', { timeZone: 'America/Chicago' }).replace(' ', 'T'));
                        await createBaptismMilestone(formData);
                        onUpdate();
                        const updated = await getApplicantDetail(
                          applicant.info.Contact_ID,
                          applicant.info.Participant_ID,
                          applicant.info.Group_Participant_ID!
                        );
                        setDetail(updated);
                      } catch (err) {
                        console.error("Approval failed:", err);
                      } finally {
                        setActionLoading(null);
                      }
                    }}
                  >
                    {actionLoading === "approve" ? "Approving..." : "Approve for Baptism"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                    disabled={!!actionLoading}
                    onClick={() => setShowPauseConfirm(true)}
                  >
                    Pause Process
                  </Button>
                </div>
                {showPauseConfirm && (
                  <div className="mt-2 space-y-2 rounded-md border bg-yellow-50 p-2">
                    <Label htmlFor="pauseNotes" className="text-xs font-medium text-yellow-800">Reason for pausing (optional)</Label>
                    <Textarea
                      id="pauseNotes"
                      value={pauseNotes}
                      onChange={(e) => setPauseNotes(e.target.value)}
                      placeholder="Notes..."
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowPauseConfirm(false)} disabled={!!actionLoading}>Cancel</Button>
                      <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={handlePause} disabled={!!actionLoading}>
                        {actionLoading === "pause" ? "Pausing..." : "Confirm Pause"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Resume Button — on paused tab */}
            {showResumeButton && (
              <div className="space-y-2 rounded-lg border bg-green-50/50 p-3">
                <h3 className="text-sm font-semibold text-green-900">Resume Baptism Process</h3>
                {!showResumeConfirm ? (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={!!actionLoading}
                    onClick={() => setShowResumeConfirm(true)}
                  >
                    Resume Process
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowResumeConfirm(false)} disabled={!!actionLoading}>Cancel</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleResume} disabled={!!actionLoading}>
                      {actionLoading === "resume" ? "Resuming..." : "Confirm Resume"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Actions */}
            {availableMilestones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <QuickActionButton
                  show={!quickActionExpanded}
                  onClick={() => setQuickActionExpanded(true)}
                />
              </div>
            )}
            <QuickActionsPanel
              availableItems={availableMilestones}
              selectedKey={selectedMilestoneKey}
              onSelectedKeyChange={setSelectedMilestoneKey}
              date={milestoneDate}
              onDateChange={setMilestoneDate}
              notes={milestoneNotes}
              onNotesChange={setMilestoneNotes}
              fileInputRef={fileInputRef}
              fileError={fileError}
              onFileError={setFileError}
              canSubmit={!!selectedMilestoneKey && !!detail?.writeBackConfig.milestoneIds[selectedMilestoneKey] && !!detail?.writeBackConfig.programId}
              submitting={!!actionLoading}
              onSubmit={handleMarkMilestoneComplete}
              expanded={quickActionExpanded}
              onExpandedChange={setQuickActionExpanded}
            />

            {/* Checklist */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Milestones</h3>
              {checklist.map((item) => {
                const milestoneRecord = findMilestoneRecord(item.key);
                const hasRecord = !!milestoneRecord;
                const isEditing = editingKey === item.key;
                const isExpanded = expandedKey === item.key;
                const files = milestoneRecord ? recordFiles[milestoneRecord.Participant_Milestone_ID] : undefined;
                const hasExpandableContent = hasRecord && (milestoneRecord.Notes || (files && files.length > 0));
                return (
                  <div key={item.key} className="rounded-lg border bg-gray-50/50">
                    {/* Header row */}
                    <div
                      className="flex items-start justify-between gap-3 p-3 cursor-pointer"
                      onClick={() => hasRecord && handleToggleExpand(item.key)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.label}</span>
                          {item.completed && milestoneRecord && mpBaseOrigin && (
                            <a
                              href={`${mpBaseOrigin}/mp/344/${milestoneRecord.Participant_Milestone_ID}`}
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
                        {item.completed && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(item.date)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {files && files.length > 0 && (
                          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                        )}
                        <StatusBadge item={item} />
                        {hasRecord && !isEditing && (
                          <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={(e) => { e.stopPropagation(); handleStartEdit(item.key); }}
                          >
                            Edit
                          </button>
                        )}
                        {hasRecord && (
                          <svg
                            className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Edit mode */}
                    {isEditing && milestoneRecord && (
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

                    {/* Expanded read-only */}
                    {isExpanded && !isEditing && hasExpandableContent && (
                      <MilestoneExpandedView
                        notes={milestoneRecord?.Notes ?? null}
                        files={files}
                        filesLoading={filesLoading === milestoneRecord?.Participant_Milestone_ID}
                      />
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
