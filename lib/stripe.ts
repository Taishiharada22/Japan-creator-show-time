import Stripe from "stripe";

declare global {
    // eslint-disable-next-line no-var
    var __stripe__: Stripe | undefined;
}

export function getStripe() {
    if (globalThis.__stripe__) return globalThis.__stripe__;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing env: STRIPE_SECRET_KEY");

    globalThis.__stripe__ = new Stripe(key);
    return globalThis.__stripe__;
}
