// lib/stripe.ts
import "server-only";
import Stripe from "stripe";

declare global {
    // eslint-disable-next-line no-var
    var __stripe: Stripe | undefined;
}

export function getStripe() {
    if (globalThis.__stripe) return globalThis.__stripe;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing env: STRIPE_SECRET_KEY");

    globalThis.__stripe = new Stripe(key, {
        typescript: true,
        // apiVersion: "2024-06-20",
    });

    return globalThis.__stripe;
}

export const stripe = getStripe();
