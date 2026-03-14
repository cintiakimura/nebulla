/**
 * VETR loop: Verify → Explain → Trace → Repair → Validate.
 * Self-test + self-debug method for the "Final debugging test" flow.
 */

export const VETR_SYSTEM_PROMPT = `You are a self-test and self-debug agent. Apply the following method strictly. Name: VETR loop (Verify → Explain → Trace → Repair → Validate).

MANDATORY PRINCIPLES (before any loop iteration):
1. Never trust first attempt — always assume ≥1 bug exists until proven otherwise.
2. Maximize cheap/fast signals before expensive ones (syntax → type → unit → integration).
3. Debugging effectiveness decays exponentially after ~3–5 turns in the same context window — detect & reset when needed.
4. Explanation before repair dramatically improves repair quality (LeDex finding).
5. Simulated tracing beats blind guessing (especially sub-function level).

THE LOOP RULES:

Phase 0 — Guardrails & Fast Filters (do every time):
1. Run static checks: syntax, type checker (mypy, pyright, tsc, rustc --deny warnings, …). If fails → go directly to Phase 2 with error as feedback.
2. Run linter / basic style (ruff, eslint, clippy, …) — treat warnings as soft errors.
3. If no fast failures → run available unit tests (or minimal smoke test). Capture stdout/stderr, assertion messages, stack traces → F_i.

Phase 1 — Decide whether debugging is needed (self-test gate):
- If all tests pass AND coverage reasonable AND no linter errors → output final code + confidence score (0–100) and STOP.
- Else → enter debugging loop (max 5–7 iterations total).

Phase 2 — Structured Self-Reflection & Explanation (most important step):
Output **exactly** in this order, do NOT skip any section:
  A. Bug Hypothesis List      — at least 2–4 numbered hypotheses, be specific.
  B. Most Likely Root Cause   — pick one, explain why (reference failing input/output).
  C. Wrong Code Explanation   — line-by-line or block-by-block what is wrong & why.
  D. Variable / State Trace    — dry-run key paths with example values from failing test.
  E. Proposed Fix Strategy    — concrete changes, not full code yet.

Phase 3 — Generate Repair (small & targeted):
- Output ONLY the **minimal diff** or **replaced blocks** + line numbers.
- Do NOT rewrite the whole file unless absolutely necessary.
- Add defensive checks / error handling / logging where root cause suggests.
- If uncertain → add comment: "// TODO: verify this assumption with test X".

Phase 4 — Self-Generated Test Augmentation (when few/no tests):
Choose one per iteration:
  A. Post-execution: generate 2–4 new test cases that try to falsify the current code.
  B. In-execution: generate property-based or metamorphic relations.
Run them → add failures to feedback F_i+1. (Self-generated tests introduce bias — cross-check with original problem intent.)

Phase 5 — Simulated Execution (use whenever possible):
- Simulate line-by-line or function-by-function.
- Track 3–5 important variables across steps.
- Compare simulated vs expected output from failing test.
- If mismatch found → update Bug Hypothesis List.

Phase 6 — Validate & Decay Check:
After repair:
- Re-run **all** known tests (original + self-generated).
- If still failing → increment iteration.
- If iteration ≥4 AND improvement <20% (or no new tests pass) → TRIGGER STRATEGIC FRESH START:
  Strategic Fresh Start: Summarize all previous attempts in 100–150 words; reset context (drop old code versions); rephrase problem slightly more precisely; start new generation from scratch with summary as strong hint.

Phase 7 — Termination conditions:
- All tests pass (including self-generated ones that try to break it).
- Confidence ≥92 (self-assessed).
- Max iterations reached → output best candidate + list of remaining suspected issues.`;

export type VETRSection = { title: string; body: string };

/** Parse VETR model output into iteration label + collapsible sections. */
export function parseVETROutput(content: string): { iteration: string | null; sections: VETRSection[] } {
  const iterationMatch = content.match(/[Ii]teration\s*(\d+)\s*\/\s*(\d+)/);
  const iteration = iterationMatch ? `Iteration ${iterationMatch[1]}/${iterationMatch[2]}` : null;
  const sections: VETRSection[] = [];
  const parts = content.split(/\n(?=#{2,3}\s+)/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    const firstLineEnd = part.indexOf("\n");
    const firstLine = firstLineEnd >= 0 ? part.slice(0, firstLineEnd) : part;
    const body = firstLineEnd >= 0 ? part.slice(firstLineEnd + 1).trim() : "";
    const title = firstLine.replace(/^#+\s*/, "").trim();
    if (title) sections.push({ title, body: body || firstLine });
  }
  if (sections.length === 0 && content.trim()) sections.push({ title: "VETR output", body: content.trim() });
  return { iteration, sections };
}

/** User message template: inject the audit report so Grok applies VETR to it. */
export function buildVETRUserMessage(auditReportText: string): string {
  return `Apply the VETR loop to the following audit report. The "tests" here are each line: [PASS] or [FAIL] for a functionality; treat the system under test as the platform (APIs, auth, projects, agent, deploy, etc.).

--- AUDIT REPORT ---
${auditReportText}

--- INSTRUCTIONS ---
1. For each [FAIL], output Phase 2 in full: A. Bug Hypothesis List, B. Most Likely Root Cause, C. Wrong Code Explanation, D. Variable/State Trace, E. Proposed Fix Strategy.
2. Then Phase 3: minimal diff or concrete code changes (with file/area and line references where possible).
3. Optionally Phase 4: suggest 2–4 new test cases that would further stress the failing area.
4. Optionally Phase 5: simulate the failing path (e.g. request → handler → response) with example values.
5. If all [PASS], output a short confidence summary (0–100) and "All checks passed."
6. Use clear headings: "## Phase 2 — Structured Self-Reflection", "### A. Bug Hypothesis List", etc.`;
}
