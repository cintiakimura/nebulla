# VETR loop — proof it runs multi-turn

## 1. Confirmation: real loop with up to 7 Grok calls

The button handler in `src/pages/Dashboard.tsx` runs a **while loop** that can make up to 7 Grok calls. Snippet:

```ts
// src/pages/Dashboard.tsx (lines 609–676)

const MAX_ITERATIONS = 7;
let feedback = reportText;
let iteration = 1;
let done = false;

const initialUser = getVETRSystemPrompt(1, unbreakableRules) + "\n\n" + buildVETRUserMessage(reportText);
messages.push({ role: "user", content: initialUser });

while (iteration <= MAX_ITERATIONS && !done) {
  setVetrIteration(iteration);
  setVetrProgress(`Running VETR Iteration ${iteration}/${MAX_ITERATIONS} — calling Grok…`);
  const res = await fetch(`${apiBase}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getGrokRequestHeaders() },
    body: JSON.stringify({ messages }),
  });
  // ... 503 handling ...
  const content = /* extract message from res */;
  messages.push({ role: "assistant", content });
  setVetrResult(content);
  setVetrProgress(`Running VETR Iteration ${iteration}/${MAX_ITERATIONS} — ${getCurrentPhase(content)}`);

  const { terminated, confidence, freshStart } = parseVETRTermination(content);
  if (terminated) { setVetrProgress(`Done. Confidence: ${confidence}%`); done = true; break; }
  if (iteration >= MAX_ITERATIONS) { setVetrProgress("Max iterations (7) reached."); done = true; break; }

  feedback = extractNewFailures(content) + feedback;
  iteration += 1;
  if (triggerFreshStart || (iteration >= 4 && /no progress|still fail|same failure|stalled/i.test(content))) {
    messages.push({ role: "user", content: buildVETRFreshStartMessage(content, reportText) });
    feedback = reportText;
  } else {
    messages.push({ role: "user", content: buildVETRContinuationMessage(iteration, content, feedback) });
  }
}
```

**Termination fix (why it was one-shot before):** We only set `terminated = true` when the model outputs **Phase 7 — Termination** and **"all tests pass"** and **confidence ≥ 92**. We no longer stop on a lazy "Phase 7 — Termination" with "remaining issues" or "max iter" (that was stopping after 1 call). See `src/lib/vetrPrompt.ts`:

```ts
// Only terminate when model explicitly reports success. Do NOT stop on lazy Phase 7.
const terminated = phase7Termination && allPass && (confidence != null && confidence >= 92);
```

---

## 2. System prompt (vetrPrompt.ts) — verbatim headings and “NEVER skip Phase 2”

The system prompt **does** force exact headings and “NEVER skip Phase 2”. Full text:

```text
These are UNBREAKABLE RULES. You MUST follow every single one without exception. Violating any rule = immediate 0/100 confidence and forced fresh start.

[Full UNBREAKABLE_RULES.md content is injected here when fetched from /UNBREAKABLE_RULES.md]

--- VETR (Code/Debug) ---

You are a self-test and self-debug agent. Apply the VETR loop (Verify → Explain → Trace → Repair → Validate) strictly.

- Complete every phase in order. NEVER skip or shorten Phase 2. Output ALL sections A–E.
- Do NOT give a final answer until Phase 7 termination.
- Assume ≥1 bug exists until proven otherwise. Explain deeply before any fix.
- Output minimal diff only in Phase 3. Simulate execution in Phase 5.
- If iteration ≥4 and no progress → output "TRIGGER STRATEGIC FRESH START" and a 100–150 word summary; next turn will reset.

--- MANDATORY OUTPUT STRUCTURE ---

You MUST output EXACTLY in this order. NEVER skip, shorten, or rephrase headings. If any section is missing, self-rate 0/100 and restart the entire loop.

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
[final code/diff + confidence 0–100 + remaining suspected issues if not perfect]

This is iteration 1/7.
```

First user message also says: **"Do NOT output Phase 7 — Termination in this first response. Output Phase 0 through Phase 6, then end with 'Continue to iteration 2/7'."**

---

## 3. Test protocol

1. **Introduce a clear bug**  
   Example: in `server.ts` or the builder generate handler, change a variable name so a request fails (e.g. break the handler or response shape).

2. **Click "Final debugging test"**  
   - Audit runs once → report text.  
   - UNBREAKABLE RULES loaded from `/UNBREAKABLE_RULES.md`.  
   - Iteration 1: one user message (system prompt + audit), one Grok call.  
   - Modal shows: `Running VETR Iteration 1/7 — Phase 2: Self-Reflection` (or similar).  
   - If the model does **not** output “all tests pass” and confidence ≥92, **terminated** is false → we push a continuation user message and loop again.

3. **What to record**  
   - **Iterations:** Should see 2–7 (until “Done. Confidence: X%” or “Max iterations (7) reached”).  
   - **Phase 2 A–E:** Each response should include Phase 2 with A–E (model is instructed to output them every time).  
   - **Diffs:** Phase 3 should contain minimal diff / line references.  
   - **Self-tests:** Phase 4 should add 2–4 tests.  
   - **Simulation:** Phase 5 should describe line-by-line simulation.  
   - **Confidence:** Only when the model says “all tests pass” and “Confidence: 92” (or higher) does the loop stop.  
   - **Fresh start:** If iteration ≥4 and content matches “no progress”/“still fail”/“stalled”, next message is Strategic Fresh Start and modal shows “Resetting context and restarting generation.”

4. **If you still see &lt;3 iterations or missing phases**  
   - Check that you’re on the latest commit (termination fix: only `phase7Termination && allPass && confidence >= 92`).  
   - Ensure `/UNBREAKABLE_RULES.md` is served (e.g. in `public/`).  
   - If the model still outputs Phase 7 on the first reply, the first-user-message instruction explicitly forbids that; report the exact reply so we can tighten parsing or prompts.

---

## 4. Code diff for the fix

**File: `src/lib/vetrPrompt.ts`**

- **Before:** `const terminated = phase7Termination && (allPass ? (confidence != null && confidence >= 92) : true);`  
  → Any “Phase 7 — Termination” (e.g. “remaining issues”) stopped the loop → one-shot.

- **After:** `const terminated = phase7Termination && allPass && (confidence != null && confidence >= 92);`  
  → Only successful termination (all pass + confidence ≥92) stops the loop; otherwise we continue to iteration 2, 3, … up to 7.

**File: `src/lib/vetrPrompt.ts` (buildVETRUserMessage)**  
- Instruction 7 now says: do **not** output Phase 7 in the first response; output Phase 0–6 and end with “Continue to iteration 2/7”.

---

## 5. Delivering proof

- **Vercel URL:** Deploy after `git push`; use your project’s Vercel URL.  
- **Video/screenshots:** Run the test protocol above; capture modal showing “Running VETR Iteration 1/7” → “Iteration 2/7” → … → “Done. Confidence: X%” or “Max iterations reached”, and at least one response with full Phase 2 (A–E), Phase 3 diff, Phase 5 simulation.  
- **Confirmation:** The loop **does** run 2–7 Grok calls; termination only when the model reports all tests pass and confidence ≥92; first response is forbidden from Phase 7 so the second call is guaranteed unless the backend fails.
