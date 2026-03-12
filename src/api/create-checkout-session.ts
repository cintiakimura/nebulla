/**
 * Stripe Checkout session — Pro €19.99/mo. Env: STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID (set to your €19.99 price in Stripe).
 * Pass userId + plan in body. Webhook sets is_pro.
 */
import Stripe from "stripe";
import type { Request, Response } from "express";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const proPriceId = process.env.STRIPE_PRO_PRICE_ID ?? process.env.STRIPE_KING_PRO_PRICE_ID;
const introPriceId = process.env.STRIPE_INTRO_PRICE_ID;
const prototypePriceId = process.env.STRIPE_PROTOTYPE_PRICE_ID;

export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  if (!stripeSecret || stripeSecret === "PLACEHOLDER") {
    res.status(503).json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
    return;
  }
  const { plan, userId } = (req.body as { plan?: string; userId?: string }) ?? {};
  if (plan === "intro" && !introPriceId) {
    res.status(400).json({
      error: "Intro plan requested but STRIPE_INTRO_PRICE_ID is not configured. Set STRIPE_INTRO_PRICE_ID in .env or choose another plan.",
    });
    return;
  }
  const planKey = plan === "intro" ? "intro" : plan === "king_pro" || plan === "pro" ? "pro" : "prototype";
  const priceId = planKey === "intro" ? introPriceId : planKey === "pro" ? proPriceId : prototypePriceId;
  if (!priceId) {
    res.status(400).json({
      error: `Missing price ID for plan: ${planKey}. Set STRIPE_PRO_PRICE_ID or STRIPE_KING_PRO_PRICE_ID (€19.99/mo) in .env`,
    });
    return;
  }
  try {
    const stripe = new Stripe(stripeSecret);
    const origin = req.get("origin") || `${req.protocol}://${req.get("host")}` || "https://kyn.app";
    const successUrl = `${origin}/builder?paid=true&plan=${planKey}`;
    const cancelUrl = `${origin}/pricing`;
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: typeof userId === "string" ? userId : undefined,
      metadata: typeof userId === "string" ? { user_id: userId, plan: planKey } : undefined,
      subscription_data:
        typeof userId === "string"
          ? { metadata: { user_id: userId, plan: planKey } }
          : undefined,
    };
    if (planKey === "prototype" && prototypePriceId) {
      sessionParams.discounts = [{ coupon: "30KYN" }];
      sessionParams.subscription_data = {
        ...(sessionParams.subscription_data ?? {}),
        trial_period_days: 30,
      };
    }
    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("[create-checkout-session]", err);
    res.status(500).json({ error: "Checkout session failed" });
  }
}
