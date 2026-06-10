import {
  FEEDBACK_INCLUDE_HINT,
  FEEDBACK_PRIVACY_NOTE,
  MP5_BETA_FEEDBACK_URL,
  MP5_BUG_REPORT_URL,
  MP5_COMPATIBILITY_ISSUE_URL,
  MP5_GITHUB_ISSUES_URL,
} from "../lib/betaFeedback";

export function BetaFeedbackPanel() {
  return (
    <section
      className="text-xs text-gray-500 space-y-2 leading-relaxed border border-white/5 rounded-lg p-3"
      data-testid="beta-feedback-panel"
    >
      <h3 className="text-sm font-medium text-gray-300">Report a bug / Give feedback</h3>
      <p>{FEEDBACK_INCLUDE_HINT}</p>
      <p className="text-[10px] text-gray-600">{FEEDBACK_PRIVACY_NOTE}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <a
          href={MP5_BUG_REPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mp5-btn-secondary text-xs min-h-[32px] inline-flex items-center"
          data-testid="feedback-bug-report-link"
        >
          Report a bug
        </a>
        <a
          href={MP5_BETA_FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mp5-btn-secondary text-xs min-h-[32px] inline-flex items-center"
          data-testid="feedback-beta-link"
        >
          Beta feedback
        </a>
        <a
          href={MP5_COMPATIBILITY_ISSUE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mp5-btn-secondary text-xs min-h-[32px] inline-flex items-center"
          data-testid="feedback-compatibility-link"
        >
          File compatibility
        </a>
        <a
          href={MP5_GITHUB_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline min-h-[32px] inline-flex items-center"
          data-testid="feedback-all-issues-link"
        >
          All issue templates
        </a>
      </div>
      <p className="text-[10px] text-gray-600">
        Settings → Diagnostics → <strong className="text-gray-500">Copy diagnostics</strong> before
        filing. No files are uploaded automatically.
      </p>
    </section>
  );
}
