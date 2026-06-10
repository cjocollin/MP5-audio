/** Public Beta feedback links - no telemetry, no auto-upload. */
import { MP5_GITHUB_URL } from "./publicLinks";

export const MP5_GITHUB_ISSUES_URL = `${MP5_GITHUB_URL}/issues/new/choose`;
export const MP5_BUG_REPORT_URL = `${MP5_GITHUB_URL}/issues/new?template=bug_report.yml`;
export const MP5_BETA_FEEDBACK_URL = `${MP5_GITHUB_URL}/issues/new?template=beta_feedback.yml`;
export const MP5_COMPATIBILITY_ISSUE_URL = `${MP5_GITHUB_URL}/issues/new?template=mp5_compatibility.yml`;

export const FEEDBACK_INCLUDE_HINT =
  "Include MP5 version, browser/OS, file type (.mp5 or .mp5p), steps to reproduce, and paste diagnostics from Settings if safe.";

export const FEEDBACK_PRIVACY_NOTE =
  "Files stay in your browser unless you export or save locally. Do not upload copyrighted or private audio to GitHub unless you have rights and choose to share it.";

/** Concise first-user guidance (landing + demo guide). */
export const FIRST_USER_TIPS = [
  "Start with the hosted demos before converting your own files.",
  "Use MP5-L v3 for serious conversion - it is the recommended lossless mode.",
  "MP5-C is lab-only; MP5-H is large and not default.",
  "Large embedded .mp5p albums can be heavy in the browser.",
  "Audio processing stays local in this tab; nothing is uploaded automatically.",
  "Exported .mp5 files are experimental - keep important originals elsewhere.",
] as const;
