# VETR confirmation test — 3 bugs + run checklist

## Bugs introduced (for test only)

1. **TTS (server)** — `server.ts`  
   - **What:** `/api/tts` always returns 500 with "VETR_TEST_BUG".  
   - **Revert:** Delete the 3 lines that say `// VETR_TEST_BUG` and the `res.status(500)... return;` right after the apiKey check.

2. **Mind map JSON parse** — `src/pages/Dashboard.tsx`  
   - **What:** Appends `"]"` to the mind map JSON string so `JSON.parse` throws and mind map stays null.  
   - **Revert:** Change `jsonMatch[0] + "]"` back to `jsonMatch[0]` in the `raw` assignment (and remove the VETR_TEST_BUG comment).

3. **Builder apply logic** — `src/pages/Builder.tsx`  
   - **What:** `applyCodeFromContent` never applies code (condition `lastTsx.length > 99999` is never true).  
   - **Revert:** Change `99999` back to `10` (and remove the VETR_TEST_BUG comment).

4. **TTS fallback (frontend)** — `src/lib/grokVoiceAgent.ts`  
   - **What:** `speakWithSpeechSynthesisFallback` returns immediately without speaking (for non-empty text).  
   - **Revert:** Remove the `if (text.length > 0) { onEnd?.(); return () => {}; }` block and the VETR_TEST_BUG comment.

The **audit** will see the **server TTS** failure (#1). Mind map and builder apply are frontend-only; the audit may still pass those if it only hits APIs. For a stronger test, run with these bugs and confirm multiple VETR iterations and phases; then revert all four.

---

## Confirmation checklist

- [ ] Deploy (push to main; get Vercel URL).
- [ ] Run "Final debugging test" with the 3+ bugs in place.
- [ ] Confirm **multiple iterations** (3–7) in the modal.
- [ ] Confirm **Phase 2 A–E** present every turn (Bug Hypothesis List, Most Likely Root Cause, Wrong Code Explanation, Variable/State Trace, Proposed Fix Strategy).
- [ ] Confirm **Phase 3** minimal diffs with file/line references.
- [ ] Confirm **Phase 5** simulated execution with variables.
- [ ] If stalled after 4+ turns: **Fresh start** banner ("Resetting context and restarting generation").
- [ ] Final state: **confidence** (e.g. "Done. Confidence: 94%") and/or **repaired code** in output.
- [ ] Record **Vercel URL** + **video or screenshots** (iterations + phases visible).
- [ ] **Revert** all VETR_TEST_BUG blocks when done.

---

## Quick revert (all bugs)

```bash
# Search for VETR_TEST_BUG and remove the added lines in:
# - server.ts (TTS 500 return)
# - src/pages/Dashboard.tsx (raw + "]")
# - src/pages/Builder.tsx (99999 -> 10)
# - src/lib/grokVoiceAgent.ts (early return block)
```

Or use git: `git checkout -- server.ts src/pages/Dashboard.tsx src/pages/Builder.tsx src/lib/grokVoiceAgent.ts` (only if no other changes in those files).
