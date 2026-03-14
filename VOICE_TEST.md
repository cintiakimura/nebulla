# Voice test — under 60 seconds

**Cintia, open browser, say "build a todo app", watch it happen.**

## 1. Run

```bash
cd /Users/cintiakimura/Documents/kyn
npm run dev
```

Wait for: `Server running on http://localhost:3000` and `Grok: API key loaded`.

## 2. Browser

Open **http://localhost:3000**.

- You get **Kyn. Let's build.** and **Start** (localhost = open mode, no login).
- Click **Start** → Dashboard.

## 3. Dashboard — mic and chat

- Right panel: **Chat** with a **Voice** button.
- Click **Voice** (turns red, "Listening...").
- Say: **"Build a todo app"** (or "hi" to test).
- Click **Voice** again to send.
- Grok replies in chat and speaks back (TTS). Chat updates.

## 4. Builder — voice → code → TTS

- On Dashboard click **Start with Grok** or **New project** (or create a project).
- You land in **Builder**: Explorer (App.tsx), Live Preview, Chat on the right.
- In chat: click **Voice**, say **"build a todo app"**, click again (or type and send).
- Grok returns code; it’s applied to App.tsx and preview updates. If "Grok speaks" is on, you hear the reply.

## 5. GitHub login (when you want to be "Cintia")

- Go to **Login** (or `/login`).
- Use **GitHub** (or email magic link if Supabase is set).
- After callback you’re in as your Supabase user; Dashboard and Builder use that identity.

---

**Env:** `.env` needs `GROK_API_KEY` (you have it). No Stripe/hosting needed for this flow. Supabase/Vercel stay as wired; localhost works without them for voice + Grok.
