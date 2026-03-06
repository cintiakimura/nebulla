# kyn — Full Project Documentation

## 1. What the app is

**kyn** is a **developer-first SaaS starter** and **Grok-powered app builder**. Users describe what they want to build (via chat and voice), connect their stack once (GitHub, Supabase, Vercel, Stripe, DNS), then use a single AI agent (Grok/Eve) to architect, code, and deploy—with no model switching and minimal manual setup.

---

## 2. Goal

- **For users:** Describe an app → connect tools once → get a working app (code, live preview, deploy) with one AI partner (Grok) that asks the right questions first, then codes and self-debugs.
- **For the platform:** One agent only (Grok/Eve); architecture-first (mind map / blueprint) then code; VETR loop (Verify, Explain, Trace, Repair) for quality; one-click deploy to GitHub / Netlify / Firebase; one-time setup so users never repeat config.

---

## 3. Functionalities (by area)

### 3.1 Landing & acquisition

| Feature | Description |
|--------|-------------|
| **Landing (`/`)** | Hero with brand name "kyn", tagline, short copy; two pricing cards (5.99 € "Start prototyping", 19.99 € "Get all features") with subtext; four content cards in a 2×2 grid (Real AI Dev Partner, Visualization First, AI self debug, All-in-One). All text white; buttons with black text. |
| **Header** | Top-right: Login (text link), Sign up (filled button). |
| **Pricing (`/pricing`)** | Pricing plans; Stripe-oriented. |
| **Login (`/login`)** | GitHub OAuth (and optional email); entry into the app. |

### 3.2 One-time setup

| Feature | Description |
|--------|-------------|
| **Setup wizard (`/setup`)** | Shown before building or via "Connect stack first?". Cards: **GitHub** (OAuth Connect), **Supabase** (dashboard link + URL + anon key, stored in localStorage), **Vercel** (Connect OAuth), **Stripe** (secret key), **Domain** (optional; Vercel DNS A/CNAME, copy, registrar links, verify). Bottom: Skip (with nudge). On complete → "All wired—now, what's your app about?" and transition to goal questions. State persisted in localStorage; wizard hidden after completion. |
| **Settings (`/settings`)** | Same "Connect Tools" (GitHub, Supabase, Vercel, Stripe, DNS) + **Secrets** (key-value, no duplicate keys). No Account tab; profile assumed from login. |

### 3.3 Dashboard

| Feature | Description |
|--------|-------------|
| **Dashboard (`/dashboard`)** | Left sidebar: New Project (blue), Projects, Settings (gear). Top bar: **Open File** and **Open from GitHub** (prominent); avatar dropdown (Settings, Billing, Account, Logout). Middle: no projects → empty state ("Let's build!", Open File + Open from GitHub, "Connect stack first?"); with projects → grid of cards (name, status Live/Preview/Draft, last edit, thumbnail), tabs (All / Deployed / Drafts), search. Right: optional **Chat** (mic, upload, copy/link, transcribed voice). |

### 3.4 Builder (core)

| Feature | Description |
|--------|-------------|
| **Layout** | Far-left **activity bar** (Explorer, Live Preview eye, Deploy, Settings/Wrench, Settings gear). **Explorer** sidebar: App.tsx, package.json; Deploy actions (Push to GitHub, Auto-Deploy). **Center**: tabbed content (Live Preview, App.tsx, package.json) filling full width/height; **terminal** at bottom; **chat** on the right. |
| **Tabs** | Live Preview, App.tsx, package.json. Clicking a tab or a file in Explorer opens/focuses that tab. Preview and code views fill the entire middle area. |
| **Live Preview** | Sandpack iframe running current App.tsx in real time. |
| **Code** | Monaco editor for App.tsx (synced with Sandpack) and for package.json. |
| **Chat** | Persistent history; **Open talk** (mic) for live voice; paperclip for file upload (drag-drop or picker); copy last reply; copy link. Voice transcribed; messages sent to Grok via `/api/agent/chat`. |
| **Terminal** | Logs (build, deploy, voice, upload); can be toggled. |
| **Deploy** | Buttons in Explorer call backend (GitHub/Netlify); status bar shows branch, etc. |

### 3.5 Onboarding & mind map

| Feature | Description |
|--------|-------------|
| **Onboarding (`/onboarding`)** | Multi-step form (e.g. pages, nav, roles) and **Mind Map** (drag-and-drop pages/roles/nodes) to define app structure before code. Uses **@xyflow/react** for the diagram. |

### 3.6 AI agent (Grok/Eve)

| Feature | Description |
|--------|-------------|
| **Role** | Single agent only (Grok); calm, conversational; asks 8 questions before coding (objective, users/roles, data/models, constraints, branding, pages/nav, integrations, done state); then uses VETR (Verify, Explain, Trace, Repair); minimal diffs, confidence score; max 5 iterations then reset. |
| **Config** | `src/config/agentConfig.ts`: system prompt and pre-code questions. Backend exposes `GET /api/agent/config`. |
| **Chat** | Builder and Dashboard chat send messages to `POST /api/agent/chat`; backend calls xAI Grok API with system prompt from agent config. |
| **Voice** | Browser **Speech Recognition** for "Open talk"; transcript shown in chat and sent to Grok. |

---

## 4. Frontend

### 4.1 Stack

| Technology | Purpose |
|------------|--------|
| **React 19** | UI framework. |
| **TypeScript** | Typing. |
| **Vite 6** | Build tool, dev server, HMR. |
| **React Router 7** | Client-side routing. |
| **Tailwind CSS 4** | Styling (`@tailwindcss/vite`). |
| **Lucide React** | Icons. |
| **clsx** + **tailwind-merge** | Class merging (e.g. `utils.cn`). |
| **Motion** | Animations (where used). |

### 4.2 Key libraries by feature

| Feature | Library | Purpose |
|---------|---------|--------|
| Code editor | `@monaco-editor/react` | Edit App.tsx and package.json. |
| Live preview | `@codesandbox/sandpack-react` | Run React app in iframe from current App.tsx. |
| Mind map | `@xyflow/react` | Drag-and-drop diagram (pages, roles, nodes). |
| Voice | `react-speech-recognition` | Live transcription for chat / Open talk. |
| File upload | `react-dropzone` | Drag-drop in chat and dashboard. |
| HTTP | `axios` | API calls (where used). |
| Storage | `crypto-js` | Optional encryption for stored secrets. |
| GitHub (future) | `@octokit/rest` | Repos, create, push when wired. |
| Auth/DB (future) | `@supabase/supabase-js`, **Firebase** | Auth and data when wired. |

### 4.3 Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Landing | Marketing + pricing cards. |
| `/login` | Login | GitHub OAuth, optional email. |
| `/pricing` | Pricing | Plans, Stripe. |
| `/dashboard` | Dashboard | Projects grid or empty state, sidebar, chat. |
| `/onboarding` | Onboarding | Steps + Mind Map. |
| `/builder` | Builder | Editor, preview, chat, terminal. |
| `/setup` | Setup | One-time setup wizard (tweaks). |
| `/settings` | Settings | Connect Tools + Secrets. |

### 4.4 Main frontend files

| Path | Role |
|------|------|
| `src/App.tsx` | Router, global wrapper. |
| `src/main.tsx` | React entry. |
| `src/index.css` | Tailwind import. |
| `src/pages/Landing.tsx` | Landing hero + cards. |
| `src/pages/Login.tsx` | Login. |
| `src/pages/Pricing.tsx` | Pricing. |
| `src/pages/Dashboard.tsx` | Dashboard layout, projects, chat. |
| `src/pages/Onboarding.tsx` | Onboarding + Mind Map. |
| `src/pages/Builder.tsx` | Builder UI, tabs, chat, Grok integration. |
| `src/pages/Setup.tsx` | Setup wizard page. |
| `src/pages/Settings.tsx` | Settings (Connect Tools + Secrets). |
| `src/components/SetupWizard.tsx` | Setup cards (GitHub, Supabase, Vercel, Stripe, Domain). |
| `src/components/MindMap.tsx` | xyflow diagram. |
| `src/config/agentConfig.ts` | Grok/Eve system prompt and pre-code questions. |
| `src/lib/setupStorage.ts` | localStorage helpers (setup, Supabase, services, Stripe, secrets, profile). |
| `src/lib/utils.ts` | Shared utils (e.g. `cn`). |

---

## 5. Backend

### 5.1 Stack

| Technology | Purpose |
|------------|--------|
| **Node.js** | Runtime. |
| **Express** | HTTP server, API routes. |
| **tsx** | Run TypeScript in dev (`tsx server.ts`). |
| **dotenv** | Load `.env`. |

### 5.2 API routes

| Method + path | Purpose |
|---------------|--------|
| `GET /api/agent/config` | Returns `agentId`, `systemPrompt`, `preCodeQuestions` from `agentConfig.ts` (for Grok/Eve). |
| `POST /api/agent/chat` | Body: `{ messages: [{ role, content }] }`. Adds system prompt from config, calls **xAI Grok** at `https://api.x.ai/v1/chat/completions`. Uses `GROK_API_KEY` and optional `GROK_MODEL` (default `grok-3-latest`). Returns `{ message: { role, content } }`. |
| `POST /api/deploy` | Deploy (GitHub/Firebase). Currently mock; expects `FIREBASE_PROJECT_ID`, `GITHUB_CLIENT_ID`. |
| `POST /api/netlify/hook` | Netlify hook. Currently mock; expects `NETLIFY_CLIENT_ID`. |
| `POST /api/stripe/checkout` | Stripe checkout session. Currently mock; expects `STRIPE_SECRET_KEY`. |

### 5.3 Server behavior

- **Development:** Vite middleware; SPA served by Vite; API on same port (3000).
- **Production:** `express.static("dist")` serves built SPA; API on same port.
- No database or session store in backend yet; auth/identity intended from Firebase/GitHub (and optionally Supabase) via frontend/OAuth.

### 5.4 Backend files

| Path | Role |
|------|------|
| `server.ts` | Express app, Vite middleware, all API routes. |

---

## 6. Integrations

### 6.1 Configured / intended

| Integration | Purpose | Where used | Env / config |
|-------------|---------|------------|-------------|
| **Grok (xAI)** | Sole AI agent (chat, code, create). | Builder/Dashboard chat via `/api/agent/chat`. | `GROK_API_KEY` (required), `GROK_MODEL` (optional, default `grok-3-latest`). |
| **GitHub** | OAuth login, repos, deploy. | Login, Dashboard "Open from GitHub", Deploy. | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. |
| **Firebase** | Auth / project context, deploy. | Deploy flow. | `FIREBASE_PROJECT_ID`. |
| **Supabase** | DB + auth for user apps. | Setup wizard + Settings (URL, anon key); stored in localStorage (base64). | User-provided; `SUPABASE_URL`, `SUPABASE_ANON_KEY` in .env for platform if needed. |
| **Vercel** | Deploy/hosting, DNS. | Setup/Settings (connect, DNS copy). | User connect; DNS A/CNAME in UI. |
| **Stripe** | Billing, payments. | Pricing, checkout. | `STRIPE_SECRET_KEY`. |
| **Netlify** | Deploy/hosting. | Deploy button, hook. | `NETLIFY_CLIENT_ID`. |

### 6.2 Frontend-only (localStorage)

- Setup completion, connected services (GitHub, Supabase, Vercel, Stripe, domain verified).
- Supabase URL + anon key (base64).
- Stripe key (user-level).
- Secrets (key-value).
- Profile (displayName, email, prefs).

---

## 7. Technology summary (by layer)

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, Vite 6, React Router 7, Tailwind CSS 4, Monaco Editor, Sandpack, @xyflow/react, react-speech-recognition, react-dropzone, Lucide, Motion, clsx, tailwind-merge, axios, crypto-js, @octokit/rest, @supabase/supabase-js, Firebase. |
| **Backend** | Node.js, Express, tsx (dev), dotenv. |
| **Build** | Vite (SPA), `vite build` → `dist`. |
| **AI** | Grok only; config in `src/config/agentConfig.ts`; backend calls xAI API; `GROK_API_KEY`, optional `GROK_MODEL`. |
| **Auth** | Firebase + GitHub OAuth (intended); no backend session yet. |
| **Data** | User/stack state in localStorage (setupStorage); Supabase for user apps (user-configured). |
| **Deploy** | GitHub, Netlify, Firebase (API stubs; env for IDs/keys). |
| **Payments** | Stripe (checkout stub; `STRIPE_SECRET_KEY`). |

---

## 8. Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROK_API_KEY` | Yes (for chat) | xAI API key (console.x.ai). |
| `GROK_MODEL` | No | Grok model (default `grok-3-latest`). |
| `APP_URL` | Optional | App URL for callbacks/links. |
| `FIREBASE_PROJECT_ID` | For deploy | Firebase project. |
| `GITHUB_CLIENT_ID` | For OAuth/deploy | GitHub OAuth. |
| `GITHUB_CLIENT_SECRET` | For OAuth | GitHub OAuth. |
| `NETLIFY_CLIENT_ID` | For Netlify | Netlify. |
| `SUPABASE_URL` | Optional | Platform Supabase. |
| `SUPABASE_ANON_KEY` | Optional | Platform Supabase. |
| `STRIPE_SECRET_KEY` | For checkout | Stripe. |

---

## 9. Current state (summary)

- **Working:** Full UI flow (landing → login → dashboard → builder), one-time setup wizard, settings (Connect Tools + Secrets), tabbed builder (preview + App.tsx + package.json), chat with Open talk and upload, **Grok-only** chat via `/api/agent/chat`, deploy buttons (mocked), agent config API, dark theme.
- **Stubbed / not wired:** Real GitHub/Netlify/Firebase deploy, Stripe checkout, Firebase auth, Supabase as backend for kyn itself. User Supabase/Stripe/Vercel credentials stored client-side (localStorage) for when those flows are implemented.
