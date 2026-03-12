/**
 * Stripe Checkout session — single plan Pro €19.90/mo. Env: STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID.
 * Pass userId in body. Webhook sets is_pro (no paid_until).
 */
import Stripe from "stripe";
import type { Request, Response } from "express";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const proPriceId = process.env.STRIPE_PRO_PRICE_ID ?? process.env.STRIPE_KING_PRO_PRICE_ID;

export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  if (!stripeSecret || stripeSecret === "PLACEHOLDER") {
    res.status(503).json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
    return;
  }
  const { userId } = (req.body as { plan?: string; userId?: string }) ?? {};
  if (!proPriceId) {
    res.status(400).json({
      error: "Missing STRIPE_PRO_PRICE_ID (€19.90/mo) in .env",
    });
    return;
  }
  try {
    const stripe = new Stripe(stripeSecret);
    const origin = req.get("origin") || `${req.protocol}://${req.get("host")}` || "https://kyn.app";
    const successUrl = `${origin}/builder?paid=true&plan=pro`;
    const cancelUrl = `${origin}/pricing`;
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: proPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: typeof userId === "string" ? userId : undefined,
      metadata: typeof userId === "string" ? { user_id: userId, plan: "pro" } : undefined,
      subscription_data:
        typeof userId === "string"
          ? { metadata: { user_id: userId, plan: "pro" } }
          : undefined,
    };
    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("[create-checkout-session]", err);
    res.status(500).json({ error: "Checkout session failed" });
  }
}
