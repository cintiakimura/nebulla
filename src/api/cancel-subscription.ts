/**
 * Cancel subscription at period end. Auth required.
 * Env: STRIPE_SECRET_KEY. Uses stripe_subscription_id from user metadata.
 */
import Stripe from "stripe";
import type { Request, Response } from "express";
import { getUserMetadata } from "../lib/supabase-multi-tenant.js";

type Req = Request & { userId?: string };

export async function cancelSubscription(req: Request, res: Response): Promise<void> {
  const userId = (req as Req).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret || stripeSecret === "PLACEHOLDER") {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }
  const meta = await getUserMetadata(userId);
  const subId = meta?.stripe_subscription_id ?? null;
  if (!subId) {
    res.status(400).json({ error: "No active subscription found" });
    return;
  }
  try {
    const stripe = new Stripe(stripeSecret);
    await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    res.json({ ok: true, message: "Subscription will cancel at period end" });
  } catch (err) {
    console.error("[cancel-subscription]", err);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
}
