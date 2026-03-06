# kyn – Project Summary

## What the project is

**kyn** is a **developer-first SaaS starter** and **Grok-powered app builder**. The goal is to let users describe an app (via chat and voice), go through a structured discovery (goal, users, data, constraints, branding, pages, integrations, done state), then build and deploy with AI assistance—with **one-time setup** for tools (GitHub, Supabase, Vercel, Stripe, DNS) so they don’t repeat config.

---

## Goal

- **For users:** Describe what they want → connect their stack once → get a working app (code, preview, deploy) with minimal manual setup.
- **For the platform:** Single AI agent (Grok/Eve), no model switching; architecture-first (mind map / blueprint) then code; VETR loop (Verify, Explain, Trace, Repair) for quality; one-click deploy to GitHub/Netlify.

---

## Main functionalities

### 1. Landing & acquisition
- **Landing** (`/`): Hero, value props (Grok-powered, architecture-first, mind map, no perfect prompts), CTA (Start prototyping / Sign up), sections (Real AI partner, Visualization first, Coding with partner, All-in-one), footer.
- **Pricing** (`/pricing`): Plans (e.g. Free vs Pro), Stripe-oriented.
- **Login** (`/login`): GitHub OAuth (and optional email); entry into the app.

### 2. One-time setup
- **Setup wizard** (`/setup`): Shown before building (or via “Connect stack first?”). Cards: **GitHub** (OAuth Connect), **Supabase** (dashboard link + URL + anon key, stored), **Vercel** (Connect OAuth), **Stripe** (secret key), **Domain** (optional; Vercel DNS A/CNAME, copy, GoDaddy/Cloudflare links, verify). Bottom: Skip (with nudge). On complete → “All wired—now, what’s your app about?” and transition to goal questions. State persisted (e.g. localStorage); wizard hidden after completion.
- **Settings** (`/settings`): Same “Connect Tools” (GitHub, Supabase, Vercel, Stripe, DNS) + **Secrets** (key-value, no duplicate keys). No Account tab; profile assumed from login.

### 3. Dashboard
- **Dashboard** (`/dashboard`): Left sidebar (New Project blue, Projects, Settings gear). Top bar: **Open File** and **Open from GitHub** (prominent); avatar dropdown (Settings, Billing, Account, Logout). Middle: if no projects → empty state (“Let’s build!”, Open File + Open from GitHub, “Connect stack first?”); if projects → grid of cards (name, status Live/Preview/Draft, last edit, thumbnail), tabs (All / Deployed / Drafts), search. Right: optional **Chat** (mic, upload, copy/link, transcribed voice). Billing/Account only in avatar menu.

### 4. Builder (core)
- **Layout:** Far-left **activity bar** (Explorer, Live Preview eye, Deploy, Settings/Wrench, Settings gear). **Explorer** sidebar (App.tsx, package.json; Deploy: Push to GitHub, Auto-Deploy). **Center** = tabbed content (Live Preview, App.tsx, package.json) filling full width/height; **terminal** at bottom; **chat** on the right.
- **Tabs:** Live Preview, App.tsx, package.json. Clicking a tab or a file in Explorer opens/focuses that tab. Preview and code views use absolute layout so they fill the entire middle section.
- **Live Preview:** Sandpack iframe running the current App.tsx; full center area.
- **Code:** Monaco editor for App.tsx (synced with Sandpack) and for package.json.
- **Chat:** Persistent history; **Open talk** (mic) for live voice; paperclip for file upload (drag-drop or picker); copy last reply; copy link. Voice transcribed; optional AI responses (e.g. mock Grok).
- **Terminal:** Logs (build, deploy, voice, upload); can be toggled.
- **Deploy:** Buttons in Explorer call backend (GitHub/Netlify); status bar shows branch, etc.

### 5. Onboarding / mind map
- **Onboarding** (`/onboarding`): Multi-step form (e.g. pages, nav, roles) and **Mind Map** (drag-and-drop pages/roles/nodes) to define app structure before code. Uses **@xyflow/react** for the diagram.

### 6. AI agent (Grok/Eve)
- **Role:** Single agent; calm, conversational; asks 8 questions before coding (objective, users/roles, data/models, constraints, branding, pages/nav, integrations, done state); then uses VETR (Verify, Explain, Trace, Repair); minimal diffs, confidence score; max 5 iterations then reset.
- **Config:** `src/config/agentConfig.ts` holds system prompt and pre-code questions. Backend exposes `GET /api/agent/config` for the frontend to use as system instructions when calling Grok.
- **Voice:** Browser **Speech Recognition** for “Open talk”; transcript shown in chat; can drive mock AI updates to code.

---

## Frontend

- **Stack:** React 19, TypeScript, Vite 6, React Router 7.
- **Styling:** Tailwind CSS 4 (`@tailwindcss/vite`), dark theme (blue-grey IDE-style: `#1e1e2e`, `#252536`, `#3d3d4d`, `#007acc`), `clsx` + `tailwind-merge` (e.g. `utils.cn`).
- **UI:** Lucide React icons; Motion for animation where used.
- **Editor & preview:** `@monaco-editor/react` (code); `@codesandbox/sandpack-react` (live React preview from App.tsx).
- **Diagrams:** `@xyflow/react` (Mind Map in Onboarding).
- **Voice:** `react-speech-recognition` (transcription for chat / Open talk).
- **File upload:** `react-dropzone` (chat and dashboard empty state).
- **Routes:** `/`, `/login`, `/pricing`, `/dashboard`, `/onboarding`, `/builder`, `/setup`, `/settings`.

---

## Backend

- **Runtime:** Node with **Express**; dev via **tsx** (`tsx server.ts`), production serves built SPA from `dist`.
- **Dev:** Vite middleware in dev; single server on port 3000.
- **API:**
  - `GET /api/agent/config` – returns agent id, system prompt, pre-code questions (for Grok/Eve).
  - `POST /api/deploy` – deploy (GitHub/Firebase); currently mock, expects `FIREBASE_PROJECT_ID`, `GITHUB_CLIENT_ID`.
  - `POST /api/netlify/hook` – Netlify hook; mock, expects `NETLIFY_CLIENT_ID`.
  - `POST /api/stripe/checkout` – Stripe checkout session; mock, expects `STRIPE_SECRET_KEY`.

No database or auth implemented in backend yet; auth and identity are intended to come from Firebase/GitHub (and possibly Supabase) via frontend/OAuth.

---

## Integrations (intended / configured)

| Integration   | Purpose                         | Where used                         | Env / config                          |
|---------------|----------------------------------|------------------------------------|---------------------------------------|
| **GitHub**    | OAuth login, repos, deploy       | Login, Dashboard “Open from GitHub”, Deploy | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| **Firebase**  | Auth / project context, deploy   | Deploy flow                        | `FIREBASE_PROJECT_ID`                 |
| **Supabase**  | DB + auth for user apps          | Setup wizard + Settings (URL, anon key)     | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (user-provided, stored e.g. localStorage) |
| **Vercel**    | Deploy/hosting, DNS              | Setup/Settings (connect, DNS copy) | User connect; DNS A/CNAME in UI       |
| **Stripe**    | Billing, payments                | Pricing, checkout                  | `STRIPE_SECRET_KEY`                   |
| **Netlify**   | Deploy/hosting                   | Deploy button, hook                | `NETLIFY_CLIENT_ID` (and e.g. PAT in .env.example) |

- **@octokit/rest** is present for GitHub API (repos, create, push) when that flow is implemented.

---

## Technology summary

| Layer      | Technologies |
|-----------|------------------|
| **Frontend** | React 19, TypeScript, Vite 6, React Router 7, Tailwind CSS 4, Monaco, Sandpack, xyflow, react-speech-recognition, react-dropzone, Lucide, Motion |
| **Backend**  | Node, Express, tsx (dev) |
| **Build**    | Vite (SPA), `vite build` → `dist` |
| **AI**       | Grok only; config in repo (Grok/Eve persona and VETR flow in `agentConfig.ts`) |
| **Auth**     | Firebase + GitHub OAuth (intended); no backend session yet |
| **Data**     | Supabase (user-configured); user/stack state in localStorage (setup, secrets, profile) |
| **Deploy**   | GitHub, Netlify, Firebase (API stubs; env for IDs/keys) |
| **Payments** | Stripe (checkout stub; `STRIPE_SECRET_KEY`) |

---

## File layout (high level)

- **`/src`:** `App.tsx`, `main.tsx`, `index.css`; `pages/` (Landing, Login, Pricing, Dashboard, Onboarding, Builder, Setup, Settings); `components/` (MindMap, SetupWizard); `config/agentConfig.ts`; `lib/setupStorage.ts`, `utils.ts`.
- **`/server.ts`:** Express app, Vite middleware, API routes.
- **`/.env.example`:** Template for `APP_URL`, Firebase, GitHub, Netlify, Supabase, Stripe.

---

## Current state (as of this summary)

- **Working:** Full UI flow (landing → login → dashboard → builder), one-time setup wizard, settings (Connect Tools + Secrets), tabbed builder (preview + App.tsx + package.json), chat with Open talk and upload, deploy buttons (mocked), agent config API, IDE-style dark theme.
- **Stubbed / not wired:** Real GitHub/Netlify/Firebase deploy, Stripe checkout, Grok-backed chat, Firebase auth, Supabase as backend for kyn itself. User Supabase/Stripe/Vercel credentials are stored client-side (e.g. localStorage) for use when those flows are implemented.
