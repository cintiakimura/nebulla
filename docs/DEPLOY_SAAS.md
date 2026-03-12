# Deploy kyn as Hosted SaaS (e.g. kyn.app)

Use this checklist to deploy kyn as a complete hosted SaaS: frontend on Vercel, backend on Railway, Supabase multi-tenant, Stripe billing.

## 1. Environment variables

### Backend (Railway or your Node host)

Set these on the backend. **Required for full SaaS:**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only; never expose to frontend) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for Pro €19.99/mo (or use STRIPE_KING_PRO_PRICE_ID) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `GROK_API_KEY` | xAI API key (console.x.ai) |
| `ALLOWED_ORIGIN` | Frontend origin, e.g. `https://kyn.app` (for CORS) |

Optional: `FREE_PROJECT_LIMIT`, `FREE_GROK_DAILY_LIMIT`, `BUILDER_PRIVATE_KEY`, `GROK_MODEL`.

### Frontend (Vercel)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL, e.g. `https://your-backend.railway.app` (no trailing slash). Build-time only. |

Optional: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` if you want to pin Supabase on the client; otherwise the app fetches them from `/api/config`.

## 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the schema: in SQL Editor, execute `docs/SUPABASE_SCHEMA.sql` (creates `users`, `projects`, `chats`, RLS, etc.).
3. In Authentication → URL Configuration, set **Site URL** to your frontend URL (e.g. `https://kyn.app`) and **Redirect URLs** to include `https://kyn.app/**` and `http://localhost:5173/**` for dev.
4. Enable providers (e.g. Google, GitHub) in Authentication → Providers if needed.

## 3. Stripe

1. **Create Stripe prices:** In Stripe Dashboard → Products → create one **recurring monthly** price:
   - **Pro:** €19.99/mo → copy Price ID → `STRIPE_PRO_PRICE_ID` or `STRIPE_KING_PRO_PRICE_ID`.
   Note the Price ID (e.g. `price_xxx`) for your .env.

2. **Set webhook:** Developers → Webhooks → Add endpoint.
   - URL: `https://your-domain/api/stripe/webhook` (use your backend URL, e.g. `https://your-backend.railway.app/api/stripe/webhook`).
   - Events: `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`.
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.

3. **Test mode first:** Use Stripe **test** keys and test cards (e.g. `4242 4242 4242 4242`). Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from Stripe Dashboard → Developers → API keys / Webhooks (Test mode).

4. **Go live:** When ready, switch Stripe to **live** mode, create live product/price and webhook, then update backend env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` (or `STRIPE_KING_PRO_PRICE_ID`) with live values.

5. **Monitor:** Check Railway logs for webhook delivery and any errors; use Supabase dashboard for usage and `users.is_pro` / `paid_until`.

**Monitoring:** Check Railway logs for webhook events; use the Supabase dashboard for usage.

Customer Portal: enable in Stripe Dashboard (Settings → Billing → Customer portal) so “Manage Subscription” works.

---

## Launch checklist

1. **Test mode** – Use Stripe test keys and test cards; run full signup → limit → upgrade → export flow.
2. **Full flow test** – Sign up, hit free limit, upgrade to Pro (€19.99/mo), verify unlimited usage, export, Manage Subscription, read-only after expiry.
3. **Switch Stripe live** – Create live product/price and webhook; update backend env with live keys.
4. **Announce** – Launch on X (Twitter), Product Hunt, or your channels.

## 4. Deploy backend (Railway)

1. Connect the repo to Railway; set root to the project root.
2. Build: `npm install && npm run build` (or use a Dockerfile if you have one).
3. Start: `node server.js` or `npm run start` (ensure `server.js` is the built entry; adjust for your `package.json` scripts).
4. Add all env vars from step 1 (backend list).
5. Deploy; note the public URL (e.g. `https://kyn-backend.railway.app`).

## 5. Deploy frontend (Vercel)

1. Connect the repo to Vercel; framework preset Vite.
2. Set **Environment variable** `VITE_API_URL` = your backend URL (e.g. `https://kyn-backend.railway.app`).
3. Deploy. Ensure SPA fallback is on (e.g. `vercel.json` with `rewrites` to `index.html` for non-api routes).

## 6. Test flow

1. **Sign up** – Open frontend → Sign up / Login (Supabase Auth).
2. **Limits** – Create 3 projects, send 10 Grok messages; confirm upgrade prompt when limit is reached.
3. **Upgrade** – Click Upgrade to Pro → complete Stripe Checkout; confirm redirect to Builder with `?paid=true&plan=pro`.
4. **Unlimited** – After upgrade, create another project and send more Grok messages; no limit.
5. **Export** – In Builder, export project; confirm zip contains code and expected files (no secrets).
6. **Manage subscription** – Settings → Manage Subscription → Stripe Customer Portal opens; can cancel at period end or update payment.
7. **Read-only when expired** – If subscription is cancelled and period has ended, user should see “Pro active until [date]” then “Pro expired — upgrade to continue” in Settings; Builder chat/input disabled with “Upgrade for full access”; 403 `read_only_expired` when trying to create project or send chat.

## 7. Security notes

- **Webhook signature:** Stripe webhook handler verifies the request signature using `STRIPE_WEBHOOK_SECRET` and raw body before processing; invalid signatures return 400.
- **Rate limiting:** `POST /api/agent/chat` is rate-limited to 10 requests per minute per IP (express-rate-limit). Free-tier Grok limit (10/day per user) is enforced in addition.
- **Auth errors:** Frontend shows “Please sign in again” on 401 and redirects to login where appropriate; 403 (e.g. read-only, limit reached) shows clear messages and upgrade CTAs.

## 8. Optional

- **Custom domain:** Attach to Vercel (frontend) and Railway (backend); update Supabase redirect URLs and Stripe webhook URL if you change domains.

---

## Ready to deploy checklist

- [ ] Env vars set (backend: Supabase service role, Stripe keys + webhook secret, Grok key, ALLOWED_ORIGIN; frontend: VITE_API_URL).
- [ ] Supabase schema applied; Auth URL/redirects and providers configured.
- [ ] Stripe: Pro €19.99/mo price created (recurring monthly); webhook URL set; test mode verified, then live keys when going live.
- [ ] Backend deployed (e.g. Railway); health check `/api/health` returns 200.
- [ ] Frontend deployed (e.g. Vercel); SPA fallback and VITE_API_URL set.
- [ ] Test flow: sign up → hit free limit → upgrade → unlimited → export → Manage Subscription → read-only after expiry.

End of checklist.
