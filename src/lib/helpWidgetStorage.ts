/**
 * Persist help widget & setup wizard state (localStorage).
 * Optional: sync completed steps to Supabase user metadata later.
 */

const KEY_OPEN = "kyn_help_widget_open";
const KEY_ACTIVE_TAB = "kyn_help_active_tab";
const KEY_WIZARD_STEP = "kyn_setup_wizard_step";
const KEY_HIDDEN_FOREVER = "kyn_help_widget_hidden_forever";
const KEY_DONE_PREFIX = "kyn_setup_done_";

export type HelpTab = "setup" | "troubleshooting" | "quick-actions" | "docs";

export const SETUP_STEP_IDS = [
  "welcome",
  "supabase-project",
  "github-oauth",
  "vercel-env",
  "railway-backend",
  "test-auth",
  "optional-extras",
  "done",
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export function getHelpWidgetOpen(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY_OPEN) === "true";
}

export function setHelpWidgetOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_OPEN, open ? "true" : "false");
}

export function getHelpActiveTab(): HelpTab {
  if (typeof window === "undefined") return "setup";
  const v = localStorage.getItem(KEY_ACTIVE_TAB) as HelpTab | null;
  return v && ["setup", "troubleshooting", "quick-actions", "docs"].includes(v) ? v : "setup";
}

export function setHelpActiveTab(tab: HelpTab): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_ACTIVE_TAB, tab);
}

export function getWizardStep(): SetupStepId {
  if (typeof window === "undefined") return "welcome";
  const v = localStorage.getItem(KEY_WIZARD_STEP) as SetupStepId | null;
  return v && SETUP_STEP_IDS.includes(v) ? v : "welcome";
}

export function setWizardStep(step: SetupStepId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_WIZARD_STEP, step);
}

export function isStepDone(stepId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY_DONE_PREFIX + stepId) === "true";
}

export function setStepDone(stepId: string, done: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_DONE_PREFIX + stepId, done ? "true" : "false");
}

export function isHelpWidgetHiddenForever(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY_HIDDEN_FOREVER) === "true";
}

export function setHelpWidgetHiddenForever(hidden: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_HIDDEN_FOREVER, hidden ? "true" : "false");
}
