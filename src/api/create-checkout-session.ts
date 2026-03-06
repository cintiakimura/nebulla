/**
 * Stripe Checkout session — env only: STRIPE_SECRET_KEY, STRIPE_PROTOTYPE_PRICE_ID, STRIPE_KING_PRO_PRICE_ID.
 */
import Stripe from "stripe";
import type { Request, Response } from "express";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const prototypePriceId = process.env.STRIPE_PROTOTYPE_PRICE_ID;
const kingProPriceId = process.env.STRIPE_KING_PRO_PRICE_ID;

export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  if (!stripeSecret || stripeSecret === "PLACEHOLDER") {
    res.status(503).json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
    return;
  }
  const { plan } = (req.body as { plan?: string }) ?? {};
  const planKey = plan === "king_pro" ? "king_pro" : "prototype";
  const priceId = planKey === "king_pro" ? kingProPriceId : prototypePriceId;
  if (!priceId) {
    res.status(400).json({
      error: `Missing price ID for plan: ${planKey}. Set STRIPE_PROTOTYPE_PRICE_ID and STRIPE_KING_PRO_PRICE_ID in .env`,
    });
    return;
  }
  try {
    const stripe = new Stripe(stripeSecret);
    const origin = req.get("origin") || `${req.protocol}://${req.get("host")}` || "http://localhost:3000";
    const successUrl = `${origin}/builder?paid=true&plan=${planKey}`;
    const cancelUrl = `${origin}/builder`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url: cancelUrl,
    });
    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("[create-checkout-session]", err);
    res.status(500).json({ error: "Checkout session failed" });
  }
}
