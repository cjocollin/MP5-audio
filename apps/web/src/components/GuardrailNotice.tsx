import type { GuardrailMessage } from "../lib/performance/guardrails";

interface Props {
  messages: GuardrailMessage[];
  testId?: string;
}

export function GuardrailNotice({ messages, testId = "guardrail-notice" }: Props) {
  if (!messages.length) return null;
  const blocked = messages.some((m) => m.level === "block");
  return (
    <ul className="space-y-1.5" data-testid={testId}>
      {messages.map((m, i) => (
        <li
          key={`${m.level}-${i}`}
          className={`text-xs rounded-lg px-3 py-2 leading-relaxed ${
            m.level === "block"
              ? "text-red-200/90 bg-red-950/40 border border-red-500/20"
              : m.level === "warn"
                ? "text-amber-200/90 bg-amber-950/40 border border-amber-500/20"
                : "text-gray-400 bg-surface-elevated/60 border border-white/5"
          }`}
          data-guardrail-level={m.level}
        >
          {m.message}
        </li>
      ))}
      {blocked && (
        <li className="text-[10px] text-gray-500">
          Fix the issue above, or try a smaller clip / fewer files.
        </li>
      )}
    </ul>
  );
}
