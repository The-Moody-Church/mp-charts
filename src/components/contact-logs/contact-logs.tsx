"use client";

import React, { useState, useEffect } from "react";
import { ContactLogDisplay } from "@/lib/dto";
import { ContactLogTypes } from "@/lib/providers/ministry-platform/models/ContactLogTypes";
import { getContactLogTypes, createContactLog, updateContactLog } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRuntimeConfig } from "@/contexts";

const ContactLogFormSchema = z.object({
  notes: z
    .string()
    .min(1, "Notes are required")
    .max(2000, "Notes must be less than 2000 characters"),
  contactLogType: z.string().optional(),
  contactDate: z.string().min(1, "Contact date is required"),
  contactId: z.number().min(1, "Contact ID is required"),
});

type ContactLogFormData = z.infer<typeof ContactLogFormSchema>;

interface ContactLogsProps {
  contactLogs: ContactLogDisplay[];
  contactId: number;
  contactNickname?: string;
  contactLastName?: string;
  currentUserId?: number | null;
  onRefresh?: () => void;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTodayLocalDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ContactLogs({
  contactLogs,
  contactId,
  contactNickname,
  contactLastName,
  currentUserId,
  onRefresh,
}: ContactLogsProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const mpBaseOrigin = mpFileUrl ? new URL(mpFileUrl).origin : null;
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingLog, setEditingLog] = useState<ContactLogDisplay | null>(null);
  const [logTypes, setLogTypes] = useState<ContactLogTypes[]>([]);
  const [isLoadingLogTypes, setIsLoadingLogTypes] = useState(false);
  const getContactDisplayName = () => {
    return `${contactNickname || "Contact"} ${contactLastName || ""}`.trim();
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<ContactLogFormData>({
    resolver: zodResolver(ContactLogFormSchema),
    defaultValues: {
      contactDate: getTodayLocalDate(),
      contactId: contactId,
    },
  });

  const onCreateLog = async (data: ContactLogFormData) => {
    try {
      setIsCreating(true);
      
      const selectedLogType = logTypes.find(type => type.Contact_Log_Type === data.contactLogType);
      
      const contactLogData = {
        Contact_ID: data.contactId,
        Contact_Date: `${data.contactDate}T00:00:00.000Z`,
        Notes: data.notes,
        Contact_Log_Type_ID: selectedLogType?.Contact_Log_Type_ID || null,
        Planned_Contact_ID: null,
        Contact_Successful: null,
        Original_Contact_Log_Entry: null,
        Feedback_Entry_ID: null,
      };

      await createContactLog(contactLogData);
      
      setIsCreateModalOpen(false);
      reset();
      
      if (onRefresh) {
        onRefresh();
      }
      
    } catch (err) {
      console.error("Error creating contact log:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create contact log";
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsCreating(false);
    }
  };

  const onEditLog = async (data: ContactLogFormData) => {
    if (!editingLog) return;

    try {
      setIsEditing(true);
      
      const selectedLogType = logTypes.find(type => type.Contact_Log_Type === data.contactLogType);
      
      const contactLogData = {
        Contact_Date: `${data.contactDate}T00:00:00.000Z`,
        Notes: data.notes,
        Contact_Log_Type_ID: selectedLogType?.Contact_Log_Type_ID || null,
      };

      await updateContactLog(editingLog.Contact_Log_ID, contactLogData);
      
      setIsEditModalOpen(false);
      setEditingLog(null);
      reset();
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Error updating contact log:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to update contact log";
      alert(`Error: ${errorMessage}`);
    } finally {
      setIsEditing(false);
    }
  };

  const handleEditClick = (log: ContactLogDisplay) => {
    setEditingLog(log);
    setValue("notes", log.Notes || "");
    setValue("contactLogType", log.Contact_Log_Type || "");
    setValue(
      "contactDate",
      log.Contact_Date ? log.Contact_Date.split("T")[0] : ""
    );
    setIsEditModalOpen(true);
  };

  useEffect(() => {
    const fetchLogTypes = async () => {
      try {
        setIsLoadingLogTypes(true);
        const types = await getContactLogTypes();
        setLogTypes(types);
      } catch (error) {
        console.error("Error fetching contact log types:", error);
        setLogTypes([]);
      } finally {
        setIsLoadingLogTypes(false);
      }
    };

    fetchLogTypes();
  }, []);

  const getLogTypeColor = (logType: string | null | undefined) => {
    if (!logType) {
      return "bg-muted text-foreground";
    }

    switch (logType.toLowerCase()) {
      case "phone call":
        return "bg-blue-500/20 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "email":
        return "bg-green-500/20 dark:bg-green-500/10 text-green-700 dark:text-green-400";
      case "meeting":
        return "bg-purple-500/20 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400";
      case "visit":
        return "bg-orange-500/20 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400";
      default:
        return "bg-muted text-foreground";
    }
  };

  const getDisplayLogType = (logType: string | null | undefined) => {
    return logType || "Unknown";
  };

  const logForm = (isEdit: boolean) => (
    <form
      onSubmit={handleSubmit(isEdit ? onEditLog : onCreateLog)}
      className="space-y-4"
    >
      <input
        type="hidden"
        {...register("contactId", { valueAsNumber: true })}
      />

      <div className="space-y-2">
        <Label htmlFor={isEdit ? "editContactDate" : "createContactDate"}>Contact Date</Label>
        <Input
          id={isEdit ? "editContactDate" : "createContactDate"}
          type="date"
          {...register("contactDate")}
        />
        {errors.contactDate && (
          <p className="text-sm text-red-500">
            {errors.contactDate.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEdit ? "editContactLogType" : "createContactLogType"}>Log Type</Label>
        <Select
          onValueChange={(value) => setValue("contactLogType", value)}
          value={watch("contactLogType")}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                isLoadingLogTypes ? "Loading..." : "Select log type"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {logTypes.map((type) => (
              <SelectItem
                key={type.Contact_Log_Type_ID.toString()}
                value={type.Contact_Log_Type}
              >
                {type.Contact_Log_Type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.contactLogType && (
          <p className="text-sm text-red-500">
            {errors.contactLogType.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={isEdit ? "editNotes" : "createNotes"}>Notes</Label>
        <Textarea
          id={isEdit ? "editNotes" : "createNotes"}
          {...register("notes")}
          placeholder="Enter contact notes here..."
          className="min-h-[200px] resize-none"
        />
        {errors.notes && (
          <p className="text-sm text-red-500">
            {errors.notes.message}
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => {
            if (isEdit) {
              setIsEditModalOpen(false);
              setEditingLog(null);
            } else {
              setIsCreateModalOpen(false);
            }
            reset();
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 flex items-center gap-2"
          disabled={isEdit ? isEditing : isCreating}
        >
          {(isEdit ? isEditing : isCreating) ? (
            isEdit ? "Saving..." : "Creating..."
          ) : (
            <>
              <Save className="h-4 w-4" />
              {isEdit ? "Save Changes" : "Create Log"}
            </>
          )}
        </Button>
      </div>
    </form>
  );

  if (!contactLogs || contactLogs.length === 0) {
    return (
      <div className="bg-card shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-foreground">Contact Logs</h3>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="flex items-center gap-2"
                variant="outline"
                onClick={() => reset()}
              >
                <Plus className="h-4 w-4" />
                Add Log
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>
                  Create New Contact Log - {getContactDisplayName()}
                </DialogTitle>
                <DialogDescription>
                  Add a new contact log entry for this contact.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4">
                {logForm(false)}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="text-center py-8">
          <div className="text-muted-foreground mb-2">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">No contact logs found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-foreground">
          Contact Logs ({contactLogs.length})
        </h3>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="flex items-center gap-2"
              variant="outline"
              onClick={() => reset()}
            >
              <Plus className="h-4 w-4" />
              Add Log
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>
                Create New Contact Log - {getContactDisplayName()}
              </DialogTitle>
              <DialogDescription>
                Add a new contact log entry for this contact.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              {logForm(false)}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>
                Edit Contact Log - {getContactDisplayName()}
              </DialogTitle>
              <DialogDescription>
                Edit the contact log entry for this contact.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              {logForm(true)}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4 max-h-96 lg:max-h-[calc(100vh-12rem)] overflow-y-auto">
        {contactLogs.map((log) => (
          <div
            key={log.Contact_Log_ID}
            className="border border-border rounded-lg p-4 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {/* Row 1: Type Badge | MP Link | Made By | Edit */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLogTypeColor(
                  log.Contact_Log_Type
                )}`}
              >
                {getDisplayLogType(log.Contact_Log_Type)}
              </span>
              {mpBaseOrigin && (
                <a
                  href={`${mpBaseOrigin}/mp/292/${contactId}/268/${log.Contact_Log_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-600 hover:underline flex-shrink-0 inline-flex items-center gap-0.5"
                >
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7h3a5 5 0 010 10h-3m-6 0H6A5 5 0 016 7h3M8 12h8" />
                  </svg>
                  MP
                </a>
              )}
              {log.MadeByContact && log.MadeByContact.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Made By: <span className="font-medium">{log.MadeByContact[0].Nickname || log.MadeByContact[0].First_Name} {log.MadeByContact[0].Last_Name}</span>
                </span>
              )}
              <div className="ml-auto">
                {currentUserId != null && log.Made_By === currentUserId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleEditClick(log)}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Row 2: Note content */}
            {log.Notes && (
              <p className="text-sm text-foreground whitespace-pre-wrap mb-2">
                {log.Notes}
              </p>
            )}

            {/* Row 3: Date/Time */}
            <span className="text-xs text-muted-foreground">
              {formatDateTime(log.Contact_Date)}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}
