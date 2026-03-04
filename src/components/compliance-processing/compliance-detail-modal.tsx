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
import {
  ComplianceCard as ComplianceCardData,
  ComplianceDetail,
  ComplianceChecklistItem,
  ComplianceMilestoneFileInfo,
  ComplianceMilestoneDetail,
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
  getComplianceParticipantDetail,
  createComplianceMilestone,
  createComplianceCertification,
  createComplianceFormResponse,
  updateComplianceMilestone,
  getComplianceMilestoneFiles,
  getComplianceRequirementFiles,
  uploadComplianceParticipantPhoto,
  completeComplianceParticipant,
  pauseComplianceParticipant,
  resumeComplianceParticipant,
} from "./actions";
import { useRuntimeConfig } from "@/contexts";

interface ComplianceDetailModalProps {
  slug: string;
  participant: ComplianceCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  isCurrentTab?: boolean;
  supportsPause?: boolean;
  toolName: string;
}

function ComplianceStatusBadge({ item }: { item: ComplianceChecklistItem }) {
  if (item.status === "complete") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Complete
      </span>
    );
  }
  if (item.status === "expired") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Expired
      </span>
    );
  }
  if (item.status === "expiring_soon") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
        Expiring Soon
      </span>
    );
  }
  if (item.status === "in_progress") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      Not Started
    </span>
  );
}

/** Map checklist item type → MP page ID for record links */
function getMpPageId(type: ComplianceChecklistItem["type"]): number | null {
  const pageIds: Record<ComplianceChecklistItem["type"], number | null> = {
    milestone: 344,           // Participant_Milestones
    journey_milestone: 344,   // Participant_Milestones
    background_check: 279,    // Background_Checks
    certification: 539,       // Participant_Certifications
    form: 424,                // Form_Responses
  };
  return pageIds[type];
}

function BackgroundCheckDetailView({ item }: { item: ComplianceChecklistItem }) {
  const bg = item.bgCheckDetail;
  if (!bg) return null;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Type", value: bg.typeName || "—" },
    { label: "Status", value: bg.status || "—" },
    { label: "Started", value: bg.started ? formatDate(bg.started) : "—" },
    { label: "Submitted", value: bg.submitted ? formatDate(bg.submitted) : "—" },
    { label: "Returned", value: bg.returned ? formatDate(bg.returned) : "—" },
    {
      label: "All Clear",
      value:
        bg.allClear === true ? (
          <span className="text-green-700 font-medium">Yes</span>
        ) : bg.allClear === false ? (
          <span className="text-red-700 font-medium">No</span>
        ) : (
          "—"
        ),
    },
    { label: "Expires", value: bg.expires ? formatDate(bg.expires) : "—" },
  ];

  return (
    <div className="border-t px-3 py-2 space-y-1">
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <span className="text-muted-foreground">{row.label}</span>
            <span>{row.value}</span>
          </React.Fragment>
        ))}
      </div>
      {bg.reportUrl && (
        <a
          href={bg.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-1"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          View Report on Verified First
        </a>
      )}
    </div>
  );
}

function RequirementTypeLabel({ type }: { type: ComplianceChecklistItem["type"] }) {
  const labels: Record<ComplianceChecklistItem["type"], string> = {
    background_check: "Background Check",
    certification: "Certification",
    milestone: "Milestone",
    form: "Form",
    journey_milestone: "Journey",
  };
  return (
    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
      {labels[type]}
    </span>
  );
}

export function ComplianceDetailModal({
  slug,
  participant,
  open,
  onOpenChange,
  onUpdate,
  isCurrentTab,
  supportsPause,
  toolName,
}: ComplianceDetailModalProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const [detail, setDetail] = useState<ComplianceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [milestoneNotes, setMilestoneNotes] = useState("");
  const [milestoneDate, setMilestoneDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [recordFiles, setRecordFiles] = useState<Record<number, ComplianceMilestoneFileInfo[]>>({});
  const [reqFiles, setReqFiles] = useState<Record<string, ComplianceMilestoneFileInfo[]>>({});
  const [filesLoading, setFilesLoading] = useState<number | null>(null);
  const [reqFilesLoading, setReqFilesLoading] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [pauseNotes, setPauseNotes] = useState("");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && participant) {
      setLoading(true);
      setDetail(null);
      setExpandedKey(null);
      setRecordFiles({});
      setReqFiles({});
      setFileError(null);
      setLinkCopied(false);
      setEditingKey(null);
      setEditError(null);
      setShowCompleteConfirm(false);
      setShowPauseConfirm(false);
      setShowResumeConfirm(false);
      setPauseNotes("");
      getComplianceParticipantDetail(
        slug,
        participant.info.Contact_ID,
        participant.info.Participant_ID,
        participant.info.Group_Participant_ID!
      )
        .then((d) => {
          setDetail(d);
          if (d?.milestones) {
            for (const m of d.milestones) {
              getComplianceMilestoneFiles(slug, m.Participant_Milestone_ID)
                .then((files) => setRecordFiles((prev) => ({ ...prev, [m.Participant_Milestone_ID]: files })))
                .catch(() => setRecordFiles((prev) => ({ ...prev, [m.Participant_Milestone_ID]: [] })));
            }
          }
          if (d?.checklist) {
            for (const item of d.checklist) {
              if (item.type !== "journey_milestone" && item.recordId) {
                getComplianceRequirementFiles(slug, item.type, item.recordId)
                  .then((files) => setReqFiles((prev) => ({ ...prev, [item.key]: files })))
                  .catch(() => setReqFiles((prev) => ({ ...prev, [item.key]: [] })));
              }
            }
          }
        })
        .catch((err) => console.error("Failed to load detail:", err))
        .finally(() => setLoading(false));
    }
  }, [open, participant, slug]);

  const findMilestoneRecord = (key: string): ComplianceMilestoneDetail | null => {
    if (!detail) return null;
    const milestoneId = detail.writeBackConfig.milestoneIds[key];
    if (!milestoneId) return null;
    return detail.milestones.find(m => m.Milestone_ID === milestoneId) || null;
  };

  const handleToggleReqExpand = async (item: ComplianceChecklistItem) => {
    if (expandedKey === item.key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(item.key);

    if (item.recordId && !(item.key in reqFiles)) {
      setReqFilesLoading(item.key);
      try {
        const files = await getComplianceRequirementFiles(slug, item.type, item.recordId);
        setReqFiles(prev => ({ ...prev, [item.key]: files }));
      } catch {
        setReqFiles(prev => ({ ...prev, [item.key]: [] }));
      } finally {
        setReqFilesLoading(null);
      }
    }
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
        const files = await getComplianceMilestoneFiles(slug, milestoneRecord.Participant_Milestone_ID);
        setRecordFiles(prev => ({ ...prev, [milestoneRecord.Participant_Milestone_ID]: files }));
      } catch {
        setRecordFiles(prev => ({ ...prev, [milestoneRecord.Participant_Milestone_ID]: [] }));
      } finally {
        setFilesLoading(null);
      }
    }
  };

  const handleQuickActionSubmit = async () => {
    if (!participant || !selectedMilestoneKey || !detail) return;

    const selectedItem = checklist.find(i => i.key === selectedMilestoneKey);
    if (!selectedItem) return;

    setActionLoading(`quick-action`);
    try {
      const formData = new FormData();
      const files = fileInputRef.current?.files;
      if (files) {
        for (const file of Array.from(files)) {
          formData.append("files", file);
        }
      }

      switch (selectedItem.type) {
        case 'journey_milestone': {
          const milestoneId = detail.writeBackConfig.milestoneIds[selectedMilestoneKey];
          const programId = detail.writeBackConfig.programId;
          if (!milestoneId || !programId) return;
          formData.set("Participant_ID", String(participant.info.Participant_ID));
          formData.set("Milestone_ID", String(milestoneId));
          formData.set("Program_ID", String(programId));
          formData.set("Date_Accomplished", milestoneDate + "T12:00:00");
          if (milestoneNotes) formData.set("Notes", milestoneNotes);
          await createComplianceMilestone(slug, formData);
          break;
        }
        case 'certification': {
          const certTypeId = detail.writeBackConfig.certificationTypeIds[selectedMilestoneKey];
          if (!certTypeId) return;
          formData.set("Participant_ID", String(participant.info.Participant_ID));
          formData.set("Certification_Type_ID", String(certTypeId));
          formData.set("Certification_Completed", milestoneDate + "T12:00:00");
          if (milestoneNotes) formData.set("Notes", milestoneNotes);
          await createComplianceCertification(slug, formData);
          break;
        }
        case 'form': {
          const formId = detail.writeBackConfig.formIds[selectedMilestoneKey];
          if (!formId) return;
          formData.set("Form_ID", String(formId));
          formData.set("Contact_ID", String(participant.info.Contact_ID));
          formData.set("Response_Date", milestoneDate + "T12:00:00");
          await createComplianceFormResponse(slug, formData);
          break;
        }
      }

      setMilestoneNotes("");
      setMilestoneDate(new Date().toISOString().split("T")[0]);
      setSelectedMilestoneKey("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUpdate();
      const updated = await getComplianceParticipantDetail(
        slug,
        participant.info.Contact_ID,
        participant.info.Participant_ID,
        participant.info.Group_Participant_ID!
      );
      setDetail(updated);
    } catch (err) {
      console.error("Failed to create record:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !participant) return;

    if (file.size > MAX_FILE_SIZE) {
      setFileError(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 1 MB.`);
      return;
    }

    setPhotoUploading(true);
    setFileError(null);
    try {
      const formData = new FormData();
      formData.set("Contact_ID", String(participant.info.Contact_ID));
      formData.set("photo", file);
      const result = await uploadComplianceParticipantPhoto(slug, formData);
      if (!result.success) {
        setFileError(result.error || "Upload failed");
        return;
      }
      const updated = await getComplianceParticipantDetail(
        slug,
        participant.info.Contact_ID,
        participant.info.Participant_ID,
        participant.info.Group_Participant_ID!
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

  const handleComplete = async () => {
    if (!participant) return;
    setActionLoading("complete");
    try {
      const formData = new FormData();
      formData.set("Group_Participant_ID", String(participant.info.Group_Participant_ID!));
      const result = await completeComplianceParticipant(slug, formData);
      if (!result.success) {
        setFileError(result.error || "Complete failed");
        return;
      }
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      console.error("Complete failed:", err);
      setFileError("Failed to complete participant");
    } finally {
      setActionLoading(null);
      setShowCompleteConfirm(false);
    }
  };

  const handlePause = async () => {
    if (!participant) return;
    setActionLoading("pause");
    try {
      const formData = new FormData();
      formData.set("Participant_ID", String(participant.info.Participant_ID));
      formData.set("Group_Participant_ID", String(participant.info.Group_Participant_ID!));
      if (pauseNotes) formData.set("Notes", pauseNotes);
      const result = await pauseComplianceParticipant(slug, formData);
      if (!result.success) {
        setFileError(result.error || "Pause failed");
        return;
      }
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      console.error("Pause failed:", err);
      setFileError("Failed to pause participant");
    } finally {
      setActionLoading(null);
      setShowPauseConfirm(false);
    }
  };

  const handleResume = async () => {
    if (!participant) return;
    setActionLoading("resume");
    try {
      const formData = new FormData();
      formData.set("Participant_ID", String(participant.info.Participant_ID));
      formData.set("Group_Participant_ID", String(participant.info.Group_Participant_ID!));
      const result = await resumeComplianceParticipant(slug, formData);
      if (!result.success) {
        setFileError(result.error || "Resume failed");
        return;
      }
      onUpdate();
      onOpenChange(false);
    } catch (err) {
      console.error("Resume failed:", err);
      setFileError("Failed to resume participant");
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
    if (!editingKey || !participant) return;
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

      const result = await updateComplianceMilestone(slug, formData);
      if (!result.success) {
        setEditError(result.error || "Update failed");
        setEditSaving(false);
        return;
      }

      const updated = await getComplianceParticipantDetail(
        slug,
        participant.info.Contact_ID,
        participant.info.Participant_ID,
        participant.info.Group_Participant_ID!
      );
      setDetail(updated);

      if (editFiles.length > 0) {
        const freshFiles = await getComplianceMilestoneFiles(slug, milestoneRecord.Participant_Milestone_ID);
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
    if (!participant) return;
    const url = `${window.location.origin}/compliance/${slug}?applicant=${participant.info.Group_Participant_ID!}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (!participant) return null;

  const { info } = participant;
  const displayName = getDisplayName(info.First_Name, info.Nickname);
  const checklist = detail?.checklist || participant.checklist;
  const currentImageGuid = detail?.info.Image_GUID ?? info.Image_GUID;
  const mpBaseOrigin = mpFileUrl ? new URL(mpFileUrl).origin : null;
  const mpParticipantUrl = mpBaseOrigin ? `${mpBaseOrigin}/mp/355/${info.Participant_ID}` : null;

  // Current tab — show complete (remove from tracking group) button
  const showCompleteButton = isCurrentTab && !!participant.info.Group_Participant_ID;
  // Show pause controls only when not also showing complete confirm
  const showPauseControls = supportsPause && !showCompleteConfirm;
  // Paused tab — show resume button
  const showResumeButton = supportsPause && !isCurrentTab && participant.isPaused;

  // Items available for quick-completion (milestones, certifications, forms — not background checks)
  const availableQuickActionItems = checklist.filter(
    item => item.status === "not_started" &&
      (item.type === "journey_milestone" || item.type === "certification" || item.type === "form")
  );

  // Determine notes visibility based on selected item type
  const selectedQuickItem = availableQuickActionItems.find(i => i.key === selectedMilestoneKey);
  const quickActionShowNotes = !selectedQuickItem || selectedQuickItem.type !== "form";

  // Separate requirement items from journey milestone items for display
  const requirementItems = checklist.filter(item => item.type !== "journey_milestone");
  const journeyMilestoneItems = checklist.filter(item => item.type === "journey_milestone");

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
                Started {formatDate(info.Start_Date)}
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
                  onClick={handleCopyLink}
                  className="text-blue-600 hover:underline"
                >
                  {linkCopied ? "Copied!" : "Copy Link"}
                </button>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Contact info */}
        <ContactLinks
          email={(detail?.info ?? info).Email_Address}
          phone={(detail?.info ?? info).Mobile_Phone}
        />

        {/* Discontinued alert */}
        {(detail?.isDiscontinued || participant.isDiscontinued) && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            Journey discontinued
          </div>
        )}

        {/* Compliance status */}
        {participant.isFullyCompliant && !participant.isDiscontinued && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2.5 text-sm text-green-800">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Fully compliant — all requirements met
          </div>
        )}

        {/* End date alert */}
        {(detail?.endDate || participant.endDate) && (
          <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 p-2.5 text-sm text-orange-800">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            Group membership ends {formatDate(detail?.endDate ?? participant.endDate)}
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
            {/* Action buttons — inline when collapsed, stacked when confirm is open */}
            {(showCompleteButton || (showPauseControls && isCurrentTab)) && (
              <div className={showCompleteConfirm || showPauseConfirm ? "space-y-4" : "flex flex-wrap gap-2"}>
                {showCompleteButton && (
                  !showCompleteConfirm ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-500 text-blue-700 hover:bg-blue-50"
                      disabled={!!actionLoading}
                      onClick={() => setShowCompleteConfirm(true)}
                    >
                      Remove from Tracking Group
                    </Button>
                  ) : (
                    <div className="space-y-2 rounded-md border bg-blue-50 p-2">
                      <p className="text-xs text-blue-800">This will end-date the participant&apos;s record in the tracking group.</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowCompleteConfirm(false)} disabled={!!actionLoading}>Cancel</Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleComplete} disabled={!!actionLoading}>
                          {actionLoading === "complete" ? "Removing..." : "Confirm"}
                        </Button>
                      </div>
                    </div>
                  )
                )}

                {showPauseControls && isCurrentTab && (
                  !showPauseConfirm ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                      disabled={!!actionLoading}
                      onClick={() => setShowPauseConfirm(true)}
                    >
                      Pause Process
                    </Button>
                  ) : (
                    <div className="space-y-2 rounded-md border bg-yellow-50 p-2">
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
                  )
                )}
              </div>
            )}

            {/* Resume Button — on paused tab */}
            {showResumeButton && (
              <div className="space-y-2 rounded-lg border bg-green-50/50 p-3">
                <h3 className="text-sm font-semibold text-green-900">Resume {toolName}</h3>
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

            {/* Requirements Checklist */}
            {requirementItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Requirements</h3>
                {requirementItems.map((item) => {
                  const reqMpPageId = getMpPageId(item.type);
                  const rFiles = reqFiles[item.key];
                  const hasFiles = rFiles && rFiles.length > 0;
                  const isReqExpanded = expandedKey === item.key;
                  const hasBgDetail = item.type === "background_check" && !!item.bgCheckDetail;
                  const isExpandable = hasBgDetail || (item.recordId && (hasFiles || !(item.key in reqFiles)));
                  return (
                  <div key={item.key} className="rounded-lg border bg-gray-50/50">
                    <div
                      className={`flex items-start justify-between gap-3 p-3${isExpandable ? " cursor-pointer" : ""}`}
                      onClick={() => isExpandable && handleToggleReqExpand(item)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.label}</span>
                          <RequirementTypeLabel type={item.type} />
                          {item.recordId && reqMpPageId && mpBaseOrigin && (
                            <a
                              href={`${mpBaseOrigin}/mp/${reqMpPageId}/${item.recordId}`}
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
                        {item.date && !hasBgDetail && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(item.date)}
                            {item.expires && (
                              <> &middot; Expires {formatDate(item.expires)}</>
                            )}
                          </div>
                        )}
                        {item.detail && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {item.detail}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {hasFiles && (
                          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                          </svg>
                        )}
                        <ComplianceStatusBadge item={item} />
                        {isExpandable && (
                          <svg
                            className={`h-4 w-4 text-gray-400 transition-transform ${isReqExpanded ? "rotate-180" : ""}`}
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

                    {/* Background check detail */}
                    {isReqExpanded && hasBgDetail && (
                      <BackgroundCheckDetailView item={item} />
                    )}

                    {/* Expanded file view */}
                    {isReqExpanded && item.recordId && (hasFiles || !(item.key in reqFiles)) && (
                      <MilestoneExpandedView
                        notes={null}
                        files={rFiles}
                        filesLoading={reqFilesLoading === item.key}
                      />
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Journey Milestones Checklist (if journey attached) */}
            {journeyMilestoneItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Journey Milestones</h3>
                {journeyMilestoneItems.map((item) => {
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
                            {item.recordId && mpBaseOrigin && (
                              <a
                                href={`${mpBaseOrigin}/mp/344/${item.recordId}`}
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
                          <ComplianceStatusBadge item={item} />
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
            )}

            {/* Quick Actions — milestones, certifications, forms */}
            {availableQuickActionItems.length > 0 && (
              <QuickActionsPanel
                availableItems={availableQuickActionItems}
                selectedKey={selectedMilestoneKey}
                onSelectedKeyChange={setSelectedMilestoneKey}
                date={milestoneDate}
                onDateChange={setMilestoneDate}
                notes={milestoneNotes}
                onNotesChange={setMilestoneNotes}
                fileInputRef={fileInputRef}
                fileError={fileError}
                onFileError={setFileError}
                canSubmit={!!selectedMilestoneKey && (() => {
                  if (!detail) return false;
                  if (!selectedQuickItem) return false;
                  switch (selectedQuickItem.type) {
                    case 'journey_milestone':
                      return !!detail.writeBackConfig.milestoneIds[selectedMilestoneKey] && !!detail.writeBackConfig.programId;
                    case 'certification':
                      return !!detail.writeBackConfig.certificationTypeIds[selectedMilestoneKey];
                    case 'form':
                      return !!detail.writeBackConfig.formIds[selectedMilestoneKey];
                    default:
                      return false;
                  }
                })()}
                submitting={!!actionLoading}
                onSubmit={handleQuickActionSubmit}
                showNotes={quickActionShowNotes}
                itemLabel="Item"
                notesMaxLength={500}
                allCompleteMessage="All items are complete."
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
