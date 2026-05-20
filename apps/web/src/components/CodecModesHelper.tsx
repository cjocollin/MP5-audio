import { CODEC_MODE_HELP, MP5_HONEST_LIMIT } from "../lib/codecModesCopy";

export function CodecModesHelper() {
  return (
    <details className="mp5-card text-xs" data-testid="codec-modes-helper">
      <summary className="cursor-pointer px-4 py-3 text-gray-400 hover:text-gray-200 mp5-focus-ring rounded-2xl">
        What do these codec modes mean?
      </summary>
      <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04]">
        <ul className="space-y-3">
          {CODEC_MODE_HELP.map((mode) => (
            <li key={mode.id} data-testid={`codec-help-${mode.id}`}>
              <p className="font-medium text-gray-300">
                {mode.name}
                <span className="text-gray-500 font-normal"> — {mode.tagline}</span>
              </p>
              <p className="text-gray-500 mt-0.5 leading-relaxed">{mode.detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-gray-600 leading-relaxed" data-testid="codec-honest-limit">
          {MP5_HONEST_LIMIT}
        </p>
      </div>
    </details>
  );
}
