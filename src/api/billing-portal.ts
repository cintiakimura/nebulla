/**
 * Create Stripe Customer Billing Portal session. Auth required.
 * Env: STRIPE_SECRET_KEY. Uses stripe_customer_id from user metadata.
 */
import Stripe from "stripe";
import type { Request, Response } from "express";
import { getUserMetadata } from "../lib/supabase-multi-tenant.js";

type Req = Request & { userId?: string };

export async function createBillingPortalSession(req: Request, res: Response): Promise<void> {
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
  const customerId = meta?.stripe_customer_id ?? null;
  if (!customerId) {
    res.status(400).json({ error: "No billing customer found. Subscribe first." });
    return;
  }
  try {
    const stripe = new Stripe(stripeSecret);
    const origin = req.get("origin") || `${req.protocol}://${req.get("host")}` || "https://kyn.app";
    const returnUrl = `${origin}/settings`;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("[billing-portal]", err);
    res.status(500).json({ error: "Failed to create billing portal session" });
  }
}
