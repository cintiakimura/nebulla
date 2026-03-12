# kyn — Master Plan & Product Spec (Refined)

## Core Objective

Build a **lightweight app** that lets developers **prototype SaaS products fast using only Grok**.

- **Front-load architecture** (mind map, roles, pages, auth, constraints) via **structured questions**.
- **Generate clean Next.js + Supabase code**.
- **Show live preview** (Sandpack).
- **One-click deploy** to Vercel.
- **Allow iterative tweaks** without breaking everything.

**Goal:** Prototype real apps (e.g. Paper Tamer, Lumen) in **days**, then ship without hiring devs or paying no-code fees.

---

## Scope (MVP Only)

| Item | MVP |
|------|-----|
| **Input** | Structured wizard form (not endless chat). |
| **Output** | Full Next.js app (pages, auth, RLS, storage, API calls). |
| **AI** | Only Grok API (`grok-4-1-fast-reasoning` or `grok-code-fast-1`). |
| **Out of scope for MVP** | Real-time collab, version history (add later). |

---

## Required Components

### Frontend

- **Next.js 14+** (App Router), **Tailwind CSS**, **Monaco editor**, **Sandpack preview**, **React Hook Form** wizard.

### Backend / API

- **Next.js API routes** calling Grok.
- **Supabase**: Auth, DB, Storage.

### Deployment

- **Vercel** (Hobby free).

### Env vars

- `GROK_KEY` (or `GROK_API_KEY`), `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

---

## Core Questions (Wizard Flow — 7–8 Steps Max)

| Step | Tab / Section | Question focus |
|------|----------------|----------------|
| 1 | **Objective** | App purpose + core flows (login → dashboard → main action). |
| 2 | **Users & Roles** | Actors, dashboards, permissions (auto-generates RLS). |
| 3 | **Data & Models** | Tables, relations, sensitive data. |
| 4 | **Constraints & Edges** | Limits (offline, GDPR, budget, max users, copyright). |
| 5 | **Branding System** | Upload assets → auto-Tailwind config. |
| 6 | **Pages & Navigation** | Core screens, nav style, mobile-first. |
| 7 | **Integrations / APIs** | Stripe, Google Calendar, etc. (stubbed env vars). |
| 8 | **Done State** | Success criteria (live URL, test users, zero crashes). |

**Why this wins**

- Structured prompting → **~30%+ better accuracy** (Stanford HAI).
- Front-loads boring setup while user is fresh → AI handles code + self-debug via **VETR loop** (Verify → Explain → Trace → Repair → Validate).
- Reduces debugging time (e.g. 68% of dev time wasted on AI code bugs).

---

## UI Design & Layout

**Inspired by VS Code:** dark, surgical, resizable splits.

### Color palette (dark theme default)

| Role | Value |
|------|--------|
| Background | `#1E1E1E` |
| Editor / panel | `#252526` |
| Accent | `#007ACC` (electric blue) |
| Text | `#D4D4D4` |
| Secondary text | `#858585` |
| Status bar | `#007ACC` |
| Hover | `#2A2D2E` |

### Font stack

- **UI:** Segoe UI / San Francisco (sans).
- **Mono / code:** Consolas / Menlo / Monaco.

### Layout (percentages)

| Area | Size |
|------|------|
| Left sidebar (icons) | 5–7% width |
| Main editor | 50–60% |
| Right panels | 30–35% (chat top ~60%, preview bottom ~40%) |
| Bottom terminal | 20–25% height (collapsible) |
| Top bar | 3–4% height |

### UX

- Collapsible panels, drag-resizable splits, tabs, status bar.

---

## Master Plan Wizard (Implementation)

- **Tabs** in the app map to the 7–8 steps above (Objective, Users & Roles, Data & Models, Constraints & Edges, Branding System, Pages & Navigation, Integrations/APIs, Done State).
- Each step: Grok asks the structured question → user answers → Grok summarizes → **Lock this?** → yes (save to `specs[tab]`) / no / skip / Generate.
- Output of the wizard feeds **Next.js + Supabase code generation** and **Sandpack** preview; deploy to Vercel when done.
