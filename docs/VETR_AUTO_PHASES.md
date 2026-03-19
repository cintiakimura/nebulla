# VETR — run automated phases locally

Phases **0–1** (guardrails + smoke) can be run in one command:

```bash
npm run vetr:verify
```

This runs, in order:

| Step | VETR phase | Command |
|------|------------|---------|
| 1 | **Phase 0** — static / types | `npm run lint` (`tsc --noEmit`) |
| 2 | **Phase 0** — production smoke | `npm run build` (`vite build`) |
| 3 | **Phase 0–1** — API audit | `npm run test:all:server` (`START_SERVER=1 node scripts/test-all.mjs`) |

**Not automated here** (human or Dashboard “Final debugging test” + Grok):

- **Phase 2–7** structured reflection, repair diffs, multi-turn termination — see `src/lib/vetrPrompt.ts` and Dashboard VETR flow in `AUDIT_STATUS.md`.

**Optional:** `npm run test:all` if you already have `npm run dev` on port 3000.
