import { runQuickAudit } from "./runQuickAudit";
import {
  buildVETRContinuationMessage,
  buildVETRFreshStartMessage,
  buildVETRUserMessage,
  extractNewFailures,
  fetchUnbreakableRules,
  getCurrentPhase,
  getVETRSystemPrompt,
  parseVETRTermination,
} from "./vetrPrompt";

export type RunVETRLoopParams = {
  apiBase: string;
  userId: string;
  projectId?: string;
  /** Map to "MAX iterations" in your VETR loop (VETR internally uses up to 7). */
  maxCycles?: number;
  /** Called after each Grok iteration reply. */
  onProgress?: (p: { iteration: number; phase: string; content: string; confidence: number | null }) => void;
};

export type RunVETRLoopResult = {
  finalOutput: string;
  success: boolean;
  confidence: number | null;
  terminated: boolean;
  iterationsUsed: number;
};

/**
 * VETR debug loop: Phase 0 (audit) + iterations calling Grok with the strict VETR prompt.
 * This is the equivalent of the provided debugLoop.ts sketch, adapted to this codebase.
 */
export async function runVETRLoop(params: RunVETRLoopParams): Promise<RunVETRLoopResult> {
  const { apiBase, userId, projectId, maxCycles = 4, onProgress } = params;
  const base = apiBase.replace(/\/$/, "");

  // Phase 0 — Verify: run the same quick audit that the UI uses.
  const results = await runQuickAudit(base);
  const reportText = results
    .map((r) => `[${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? " — " + r.detail : ""}`)
    .join("\n");

  // VETR utility modules assume UNBREAKABLE_RULES.md exists at the same origin.
  const unbreakableRules = await fetchUnbreakableRules();

  const MAX_ITERATIONS = Math.min(7, Math.max(1, maxCycles));
  const messages: { role: string; content: string }[] = [];
  let additionalFeedbackAccumulated = "";
  let previousOutput = "";
  let iteration = 1;
  let done = false;
  let triggerFreshStart = false;

  const initialUser = getVETRSystemPrompt(1, unbreakableRules) + "\n\n" + buildVETRUserMessage(reportText);
  messages.push({ role: "user", content: initialUser });

  while (iteration <= MAX_ITERATIONS && !done) {
    const res = await fetch(`${base}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        userId,
        projectId: projectId ?? undefined,
      }),
    });

    if (res.status === 503) {
      throw new Error("Grok service unavailable (503). Set API key in Settings and retry.");
    }

    const data = (await res.json().catch(() => ({}))) as { message?: { content?: string }; error?: string; details?: string };
    const content =
      res.ok && data?.message?.content
        ? data.message.content
        : data?.error && data?.details
          ? `${data.error}: ${data.details}`
          : data?.error || "Could not run VETR analysis.";

    previousOutput = content;
    messages.push({ role: "assistant", content });

    const { terminated, confidence, freshStart } = parseVETRTermination(content);
    if (freshStart) triggerFreshStart = true;

    onProgress?.({
      iteration,
      phase: getCurrentPhase(content),
      content,
      confidence,
    });

    if (terminated) {
      done = true;
      return {
        finalOutput: previousOutput,
        success: true,
        confidence,
        terminated: true,
        iterationsUsed: iteration,
      };
    }

    if (iteration >= MAX_ITERATIONS) {
      done = true;
      break;
    }

    additionalFeedbackAccumulated = extractNewFailures(content) + additionalFeedbackAccumulated;
    iteration += 1;

    if (triggerFreshStart || (iteration >= 4 && /no progress|still fail|same failure|stalled/i.test(content))) {
      messages.push({ role: "user", content: buildVETRFreshStartMessage(content, reportText) });
      triggerFreshStart = false;
      additionalFeedbackAccumulated = "";
    } else {
      messages.push({
        role: "user",
        content: buildVETRContinuationMessage(iteration, content, reportText, additionalFeedbackAccumulated),
      });
    }
  }

  return {
    finalOutput: previousOutput,
    success: false,
    confidence: null,
    terminated: false,
    iterationsUsed: Math.min(iteration, MAX_ITERATIONS),
  };
}

