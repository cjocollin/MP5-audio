type StepId = "drop" | "edit" | "preview" | "export" | "player";

const STEPS: { id: StepId; label: string }[] = [
  { id: "drop", label: "Drop source audio" },
  { id: "edit", label: "Edit metadata" },
  { id: "preview", label: "Preview embedded metadata" },
  { id: "export", label: "Export MP5-L v3" },
  { id: "player", label: "Download / open in player" },
];

function stepState(
  id: StepId,
  hasSource: boolean,
  exportDone: boolean,
): "upcoming" | "current" | "done" {
  if (id === "drop") {
    if (!hasSource) return "current";
    return "done";
  }
  if (id === "edit" || id === "preview") {
    if (!hasSource) return "upcoming";
    if (!exportDone) return "current";
    return "done";
  }
  if (id === "export") {
    if (!hasSource) return "upcoming";
    if (exportDone) return "done";
    return "current";
  }
  if (id === "player") {
    if (exportDone) return "current";
    return "upcoming";
  }
  return "upcoming";
}

interface Props {
  hasSource: boolean;
  exportDone: boolean;
}

export function ConverterFlowSteps({ hasSource, exportDone }: Props) {
  return (
    <ol
      className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide"
      data-testid="converter-flow-steps"
    >
      {STEPS.map((step, i) => {
        const state = stepState(step.id, hasSource, exportDone);
        return (
          <li
            key={step.id}
            className={`px-2 py-1 rounded-full border ${
              state === "done"
                ? "border-green-500/40 text-green-400/90 bg-green-950/20"
                : state === "current"
                  ? "border-accent/50 text-accent bg-accent/10"
                  : "border-white/5 text-gray-600"
            }`}
            data-testid={`converter-step-${step.id}`}
            data-step-state={state}
          >
            {i + 1}. {step.label}
          </li>
        );
      })}
    </ol>
  );
}
