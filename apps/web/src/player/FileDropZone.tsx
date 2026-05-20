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
      className={`flex flex-col items-center justify-center min-h-[140px] rounded-2xl border-2 border-dashed border-white/10 bg-surface-elevated/40 p-6 sm:p-8 transition-colors mp5-focus-ring ${
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
      <span className="text-gray-400 text-sm">{label}</span>
    </label>
  );
}
