import { useRef } from "react";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { MP5_AND_AUDIO_ACCEPT, pickMp5FilesForHandler } from "../lib/pickMp5Files";

interface Props {
  onFiles: (files: FileList) => void;
  accept?: string;
  label?: string;
  testId?: string;
  disabled?: boolean;
}

export function FileDropZone({
  onFiles,
  accept = MP5_AND_AUDIO_ACCEPT,
  label = "Drop .mp5 / .mp5p files here",
  testId,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    if (disabled) return;
    // Must stay in the click/key handler — no setTimeout (preserves user gesture).
    void pickMp5FilesForHandler(onFiles, {
      accept,
      multiple: true,
      fallbackInput: inputRef.current,
    });
  }

  return (
    <div
      className={`mp5-file-drop-zone mp5-focus-ring ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:border-accent/40 hover:bg-surface-elevated/60"
      }`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled) return;
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
      onClick={openPicker}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple
        disabled={disabled}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
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
        <FolderOpen size={17} weight="bold" /> Open / Add files
      </span>
    </div>
  );
}
