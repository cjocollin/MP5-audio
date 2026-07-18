import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";

interface Props {
  onFiles: (files: FileList) => void;
  accept?: string;
  label?: string;
  testId?: string;
  disabled?: boolean;
}

export function FileDropZone({
  onFiles,
  accept = ".mp5,audio/*",
  label = "Drop .mp5 files here",
  testId,
  disabled = false,
}: Props) {
  return (
    <label
      className={`mp5-file-drop-zone mp5-focus-ring ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:border-accent/40 hover:bg-surface-elevated/60"
      }`}
      aria-label={label}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled) return;
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        className="hidden"
        accept={accept}
        multiple
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => {
          if (!disabled && e.target.files) onFiles(e.target.files);
        }}
      />
      <span className="mp5-file-drop-icon" aria-hidden>
        <UploadSimple size={23} weight="bold" />
      </span>
      <span className="max-w-xs text-center text-sm font-medium text-gray-300">{label}</span>
      <span className="text-[11px] text-gray-600">or</span>
      <span className="mp5-file-drop-button">
        <FolderOpen size={17} weight="bold" /> Open MP5 / Add files
      </span>
    </label>
  );
}
