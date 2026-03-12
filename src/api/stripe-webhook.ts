/**
 * Stripe webhook: on subscription paid → set user is_pro in Supabase.
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 * Webhook must send raw body for signature verification.
 */
import Stripe from "stripe";
import type { Request, Response } from "express";
import { setUserPro } from "../lib/supabase-multi-tenant.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!stripeSecret || stripeSecret === "PLACEHOLDER") {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  const sig = req.headers["stripe-signature"];
  if (!webhookSecret || !sig || !rawBody) {
    res.status(400).json({ error: "Missing webhook secret or signature" });
    return;
  }
  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    stripe = new Stripe(stripeSecret);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe-webhook] Signature verification failed:", msg);
    if (typeof (globalThis as unknown as { Sentry?: { captureException: (e: unknown) => void } }).Sentry?.captureException === "function") {
      (globalThis as unknown as { Sentry: { captureException: (e: unknown) => void } }).Sentry.captureException(err);
    }
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id ?? (session.metadata as { user_id?: string } | null)?.user_id ?? undefined;
    console.log("[stripe-webhook] Webhook: checkout.session.completed for userId", userId ?? "unknown");
    const plan = (session.metadata as { plan?: string } | null)?.plan;
    const customerId = typeof session.customer === "string" ? session.customer : null;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    if (userId) {
      const knownPlan = plan === "intro" || plan === "pro" || plan === "prototype";
      if (!knownPlan) {
        console.warn("[stripe-webhook] checkout.session.completed: missing or unknown plan in metadata, skipping user update. metadata.plan=", plan);
        res.json({ received: true });
        return;
      }
      const isIntro = plan === "intro";
      let paidUntil: string | undefined;
      if (isIntro) {
        paidUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      } else if (subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          paidUntil = new Date((sub.current_period_end as number) * 1000).toISOString();
        } catch (e) {
          console.warn("[stripe-webhook] Could not retrieve subscription for paid_until, using fallback:", (e as Error)?.message);
          paidUntil = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
        }
      } else {
        // Pro/prototype with no subscription id: set conservative expiry so we never grant indefinite access
        console.warn("[stripe-webhook] checkout.session.completed: pro/prototype plan but no subscription id, using 31-day paid_until fallback");
        paidUntil = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
      }
      const planToStore = plan === "intro" ? "intro" : plan === "prototype" ? "prototype" : "pro";
      const ok = await setUserPro(userId, true, paidUntil, customerId, subscriptionId, planToStore);
      if (ok) console.log("[stripe-webhook] Set is_pro=true for user", userId, paidUntil ? "+ paid_until " + paidUntil.slice(0, 10) : "");
      else {
        console.error("[stripe-webhook] Failed to set is_pro for", userId);
        if (typeof (globalThis as unknown as { Sentry?: { captureException: (e: unknown) => void } }).Sentry?.captureException === "function") {
          (globalThis as unknown as { Sentry: { captureException: (e: unknown) => void } }).Sentry.captureException(new Error("setUserPro failed for " + userId));
        }
      }
    }
    res.json({ received: true });
    return;
  }

  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const userId = (sub.metadata as { user_id?: string })?.user_id ?? undefined;
    console.log("[stripe-webhook] Webhook:", event.type, "for userId", userId ?? "unknown");
    if (event.type === "customer.subscription.deleted" && userId) {
      const ok = await setUserPro(userId, false, null);
      if (ok) console.log("[stripe-webhook] Set is_pro=false for user", userId);
    }
    if (event.type === "customer.subscription.updated" && userId) {
      const paidUntil =
        sub.status === "active" && sub.current_period_end
          ? new Date((sub.current_period_end as number) * 1000).toISOString()
          : undefined;
      const ok = await setUserPro(userId, sub.status === "active", paidUntil, undefined, sub.id);
      if (ok) console.log("[stripe-webhook] Set is_pro=", sub.status === "active", "for user", userId, paidUntil ? ", paid_until " + paidUntil.slice(0, 10) : "");
    }
    res.json({ received: true });
    return;
  }

  console.log("[stripe-webhook] Webhook: unhandled event type", event.type);
  res.json({ received: true });
}
