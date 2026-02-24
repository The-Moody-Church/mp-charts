import { BaseFileInfo } from "@/lib/dto";
import { FileTypeIcon } from "./file-type-icon";

interface MilestoneExpandedViewProps {
  notes: string | null;
  files: BaseFileInfo[] | undefined;
  filesLoading: boolean;
}

export function MilestoneExpandedView({
  notes,
  files,
  filesLoading,
}: MilestoneExpandedViewProps) {
  return (
    <div className="px-3 pb-3 border-t bg-white space-y-2">
      {notes && (
        <div className="pt-2">
          <p className="text-xs font-medium text-gray-700 mb-0.5">Notes</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {notes}
          </p>
        </div>
      )}

      <div className="pt-1">
        <p className="text-xs font-medium text-gray-700 mb-1">Attachments</p>
        {filesLoading ? (
          <p className="text-xs text-muted-foreground">Loading files...</p>
        ) : files && files.length > 0 ? (
          <div className="space-y-1.5">
            {files.map((file) => (
              <div key={file.fileId} className="flex items-center gap-2">
                <FileTypeIcon isPdf={file.isPdf} isImage={file.isImage} />
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
  );
}
