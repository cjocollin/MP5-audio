import type { CSSProperties } from "react";
import { Check } from "@phosphor-icons/react/Check";

type StepId = "source" | "metadata" | "export";

const STEPS: { id: StepId; label: string }[] = [
  { id: "source", label: "Source" },
  { id: "metadata", label: "Metadata" },
  { id: "export", label: "Export" },
];

interface Props {
  hasSource: boolean;
  exportDone: boolean;
  metadataOpen?: boolean;
}

export function ConverterFlowSteps({ hasSource, exportDone, metadataOpen = false }: Props) {
  const currentStep = !hasSource ? 0 : metadataOpen ? 1 : 2;
  const currentLabel = exportDone ? "Complete" : STEPS[currentStep]!.label;

  return (
    <div className="mp5-converter-flow" data-testid="converter-flow-steps">
      <p className="mp5-converter-flow-mobile">
        Step {exportDone ? 3 : currentStep + 1} of 3 · {currentLabel}
      </p>
      <ol aria-label="Conversion progress">
        {STEPS.map((step, index) => {
          const done = exportDone || index < currentStep;
          const current = !exportDone && index === currentStep;
          return (
            <li
              key={step.id}
              className={done ? "is-done" : current ? "is-current" : undefined}
              data-testid={`converter-step-${step.id}`}
              data-step-state={done ? "done" : current ? "current" : "upcoming"}
            >
              <span className="mp5-converter-step-mark" aria-hidden>
                {done ? <Check size={14} weight="bold" /> : index + 1}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
      <span
        className="mp5-converter-flow-progress"
        style={{ "--mp5-converter-progress": `${exportDone ? 100 : ((currentStep + 1) / 3) * 100}%` } as CSSProperties}
        aria-hidden
      />
    </div>
  );
}
