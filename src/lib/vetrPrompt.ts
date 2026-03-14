/**
 * VETR loop: Verify → Explain → Trace → Repair → Validate.
 * Full multi-turn self-debug with mandatory structured phases.
 * UNBREAKABLE_RULES.md is injected as the very first part of the system prompt for every VETR call.
 */

const UNBREAKABLE_PREFIX = `These are UNBREAKABLE RULES. You MUST follow every single one without exception. Violating any rule = immediate 0/100 confidence and forced fresh start.

`;

/** Fetch UNBREAKABLE_RULES.md from same origin (public/UNBREAKABLE_RULES.md). */
export async function fetchUnbreakableRules(): Promise<string> {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${base}/UNBREAKABLE_RULES.md`;
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
  } catch {
    // ignore
  }
  return "";
}

const VETR_PHASES_STRUCTURE = `You MUST output EXACTLY in this order. NEVER skip, shorten, or rephrase headings. If any section is missing, self-rate 0/100 and restart the entire loop.

Phase 0: Guardrails & Fast Filters
[static checks, linter, smoke tests results]

Phase 1: Self-test Gate
[pass/fail decision + confidence]

Phase 2: Structured Self-Reflection
A. Bug Hypothesis List
1. ...
2. ...
3. ...
4. ...

B. Most Likely Root Cause
...

C. Wrong Code Explanation
[line-by-line or block-by-block]

D. Variable / State Trace
[dry-run with example values]

E. Proposed Fix Strategy
...

Phase 3: Generate Repair
ONLY minimal diff + line numbers. Add defensive checks. TODO if uncertain.

Phase 4: Self-Generated Test Augmentation
[2–4 new falsifying tests or property-based]

Phase 5: Simulated Execution
[line-by-line simulation, track 3–5 variables]

Phase 6: Validate & Decay Check
[re-run all tests; if stalled → fresh start summary]

Phase 7: Termination
[final code/diff + confidence 0–100 + remaining suspected issues if not perfect]`;

const GUARDRAILS = `
- Complete every phase in order. NEVER skip or shorten Phase 2. Output ALL sections A–E.
- Do NOT give a final answer until Phase 7 termination.
- Assume ≥1 bug exists until proven otherwise. Explain deeply before any fix.
- Output minimal diff only in Phase 3. Simulate execution in Phase 5.
- If iteration ≥4 and no progress → output "TRIGGER STRATEGIC FRESH START" and a 100–150 word summary; next turn will reset.`;

export const VETR_SYSTEM_PROMPT = `You are a self-test and self-debug agent. Apply the VETR loop (Verify → Explain → Trace → Repair → Validate) strictly.
${GUARDRAILS}

--- MANDATORY OUTPUT STRUCTURE ---
${VETR_PHASES_STRUCTURE}
`;

/** Build full system prompt for a VETR call: UNBREAKABLE_RULES + VETR + iteration. */
export function getVETRSystemPrompt(iteration: number, unbreakableRulesText: string): string {
  const rulesBlock = unbreakableRulesText.trim()
    ? UNBREAKABLE_PREFIX + unbreakableRulesText.trim() + "\n\n--- VETR (Code/Debug) ---\n\n"
    : "";
  return `${rulesBlock}${VETR_SYSTEM_PROMPT}

This is iteration ${iteration}/7.`;
}

export type VETRSection = { title: string; body: string };

/** Detect if the model output indicates termination (all pass + confidence ≥92 or max iter). */
export function parseVETRTermination(content: string): { terminated: boolean; confidence: number | null; freshStart: boolean } {
  const freshStart = /strategic fresh start|trigger strategic fresh start|reset context|strategic reset/i.test(content);
  const confidenceMatch = content.match(/confidence[:\s]*(\d+)/i);
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : null;
  const phase7Termination = /phase\s*7\s*[—\-]\s*termination|phase 7.*termination/i.test(content);
  const allPass = /all tests pass|all checks passed/i.test(content);
  // Only terminate when model explicitly reports success (all pass + confidence ≥92). Do NOT stop on lazy "Phase 7" with "remaining issues" or "max iter" — that would make the loop one-shot.
  const terminated = phase7Termination && allPass && (confidence != null && confidence >= 92);
  return { terminated: !!terminated, confidence, freshStart };
}

/** Extract current phase from response for progress display (e.g. "Phase 2: Self-Reflection"). */
export function getCurrentPhase(content: string): string {
  const phaseNames: [RegExp, string][] = [
    [/phase\s*0[:\s]|phase 0\s*[—\-]/i, "Phase 0: Guardrails & Fast Filters"],
    [/phase\s*1[:\s]|phase 1\s*[—\-]|self-test gate/i, "Phase 1: Self-test Gate"],
    [/phase\s*2[:\s]|phase 2\s*[—\-]|structured self-reflection|bug hypothesis/i, "Phase 2: Self-Reflection"],
    [/phase\s*3[:\s]|phase 3\s*[—\-]|generate repair|minimal diff/i, "Phase 3: Generate Repair"],
    [/phase\s*4[:\s]|phase 4\s*[—\-]|self-generated test|test augmentation/i, "Phase 4: Test Augmentation"],
    [/phase\s*5[:\s]|phase 5\s*[—\-]|simulated execution/i, "Phase 5: Simulated Execution"],
    [/phase\s*6[:\s]|phase 6\s*[—\-]|validate.*decay/i, "Phase 6: Validate & Decay Check"],
    [/phase\s*7[:\s]|phase 7\s*[—\-]|termination/i, "Phase 7: Termination"],
  ];
  let lastPhase = "VETR";
  for (const [re, name] of phaseNames) {
    if (re.test(content)) lastPhase = name;
  }
  return lastPhase;
}

/** Extract new failures / self-test feedback from response to append to feedback for next iteration. */
export function extractNewFailures(response: string): string {
  const lines: string[] = [];
  const lower = response.toLowerCase();
  // Lines with [FAIL], failed, still fail, assertion, error
  const failRe = /^\[FAIL\].*|^.*\bfailed\b.*|^.*\bstill fail\b.*|^.*assertion.*|expected.*actual|status\s*\d{3}/im;
  response.split("\n").forEach((line) => {
    const t = line.trim();
    if (t.length > 10 && (failRe.test(t) || /self-test|re-run|validation.*fail/i.test(t))) {
      lines.push(t);
    }
  });
  if (lines.length === 0 && (/still fail|no progress|same failure|stalled/i.test(lower) || /confidence[:\s]*[0-8]\d/i.test(response))) {
    lines.push("(Previous iteration reported low confidence or no progress.)");
  }
  return lines.length ? `\n--- New feedback from last response ---\n${lines.slice(-15).join("\n")}\n` : "";
}

/** Parse VETR model output into iteration label + collapsible sections (Phase 2 A–E, Phase 3, etc.). */
export function parseVETROutput(content: string): { iteration: string | null; sections: VETRSection[] } {
  const iterationMatch = content.match(/[Tt]his is iteration\s*(\d+)\s*\/\s*7|[Ii]teration\s*(\d+)\s*\/\s*(\d+)/);
  const iteration = iterationMatch
    ? `Iteration ${iterationMatch[1] ?? iterationMatch[2]}/${iterationMatch[3] ?? "7"}`
    : null;

  const sections: VETRSection[] = [];
  const phaseRegex = /(\*\*Phase\s+\d+[^*]*\*\*|\*\*Phase\s+\d+[:\s][^*]*\*\*|\*\*[A-E]\.[^*]+\*\*|##\s+[^\n]+|###\s+[^\n]+)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let lastTitle = "";
  let lastBody = "";

  while ((m = phaseRegex.exec(content)) !== null) {
    if (lastTitle) {
      lastBody = content.slice(lastIndex, m.index).trim();
      if (lastTitle || lastBody) sections.push({ title: lastTitle.replace(/^#+\s*|\*\*/g, "").trim(), body: lastBody });
    }
    lastTitle = m[1];
    lastIndex = m.index + m[0].length;
  }
  if (lastTitle) {
    lastBody = content.slice(lastIndex).trim();
    sections.push({ title: lastTitle.replace(/^#+\s*|\*\*/g, "").trim(), body: lastBody });
  }

  if (sections.length === 0) {
    const parts = content.split(/\n(?=#{2,3}\s+)/);
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      const firstLineEnd = p.indexOf("\n");
      const firstLine = firstLineEnd >= 0 ? p.slice(0, firstLineEnd) : p;
      const body = firstLineEnd >= 0 ? p.slice(firstLineEnd + 1).trim() : "";
      const title = firstLine.replace(/^#+\s*/, "").trim();
      if (title) sections.push({ title, body: body || firstLine });
    }
  }
  if (sections.length === 0 && content.trim()) sections.push({ title: "VETR output", body: content.trim() });
  return { iteration, sections };
}

/** Initial user message: full audit report + strict instructions. */
export function buildVETRUserMessage(auditReportText: string, additionalFeedback?: string): string {
  const feedback = additionalFeedback ? `${auditReportText}\n${additionalFeedback}` : auditReportText;
  return `Apply the VETR loop to this audit report. Each line is a functionality check: [PASS] or [FAIL] with optional detail. Treat the system under test as the platform (APIs, auth, projects, agent, voice, builder, deploy).

--- AUDIT REPORT ---
${feedback}

--- INSTRUCTIONS ---
1. Assume ≥1 bug exists. Explain deeply before any fix.
2. Output Phase 2 in full: A. Bug Hypothesis List (2–4 items), B. Most Likely Root Cause, C. Wrong Code Explanation (line-by-line), D. Variable/State Trace, E. Proposed Fix Strategy.
3. Output Phase 3: minimal diff or concrete code changes with file/line references.
4. Output Phase 4: 2–4 new test cases that would stress the failing area.
5. Output Phase 5: simulate the failing path (e.g. request → handler → response) with example values.
6. Use EXACT headings: Phase 2: Structured Self-Reflection, A. Bug Hypothesis List, B. Most Likely Root Cause, etc.
7. Do NOT output Phase 7 — Termination in this first response. Output Phase 0 through Phase 6, then end with "Continue to iteration 2/7" and what you will do next. Phase 7 is only for a later iteration when all tests actually pass and you report confidence ≥92.
8. This is iteration 1/7.`;
}

/** Continuation message for iteration N+1 (multi-turn). */
export function buildVETRContinuationMessage(
  iterationNum: number,
  previousAssistantContent: string,
  auditReportText: string,
  additionalFeedback?: string
): string {
  const feedback = additionalFeedback ? `${auditReportText}\n${additionalFeedback}` : auditReportText;
  return `Remember: UNBREAKABLE RULES apply. This is iteration ${iterationNum}/7.

Continue VETR. Your previous response was:
---
${previousAssistantContent.slice(-6000)}
---

Audit report (and new feedback) for reference:
---
${feedback}
---

Instructions:
1. If you triggered "Strategic Fresh Start", output a 100–150 word summary of all attempts, then start Phase 2 again with a new generation.
2. Otherwise: Refine your hypotheses (Phase 2), output a revised minimal diff (Phase 3), and re-validate (Phase 5–6).
3. If you now believe all tests pass, output Phase 7 — Termination with "All tests pass. Confidence: N%" (N≥92).
4. If iteration ${iterationNum} is 7, output Phase 7 — Termination with "Max iterations reached" and the best candidate + remaining suspected issues.
5. Output ALL Phase 2 subsections (A–E) again. Use exact headings.`;
}

/** Message to force Strategic Fresh Start after decay (e.g. iteration ≥4, no progress). */
export function buildVETRFreshStartMessage(previousAssistantContent: string, auditReportText: string): string {
  return `TRIGGER STRATEGIC FRESH START.

You have completed 4+ iterations without termination. Do the following:
1. Summarize all previous attempts in 100–150 words (what you tried, what failed, what you learned).
2. Reset context: treat the next output as a new generation.
3. Rephrase the problem slightly more precisely.
4. Start Phase 2 again with the summary as a strong hint. Output Phase 2: Structured Self-Reflection with A–E in full, then Phase 3–5.

Your last response (excerpt):
---
${previousAssistantContent.slice(-4000)}
---

Audit report:
---
${auditReportText}
---

Resetting context and restarting generation. This is a fresh start (iteration 5/7).`;
}
