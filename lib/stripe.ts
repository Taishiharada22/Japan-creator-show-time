// lib/stripe.ts
import Stripe from "stripe";

declare global {
    // eslint-disable-next-line no-var
    var __stripe__: Stripe | undefined;
    // eslint-disable-next-line no-var
    var __stripeKey__: string | undefined;
}

export function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY?.trim();

    if (!key) throw new Error("Missing env: STRIPE_SECRET_KEY");

    // ✅ 秘密を漏らさずprefixだけ出す
    console.log("[stripe] key prefix:", key.slice(0, 8));

    // ✅ liveキーを使ってたら即止める（live charges事故防止）
    if (key.startsWith("sk_live_")) {
        throw new Error(
            "STRIPE_SECRET_KEY is LIVE (sk_live_...). " +
            "Use sk_test_... in .env.local, then restart dev server."
        );
    }

    // ✅ 以前のキーで作られてたら作り直す
    if (globalThis.__stripe__ && globalThis.__stripeKey__ === key) {
        return globalThis.__stripe__;
    }

    globalThis.__stripe__ = new Stripe(key);
    globalThis.__stripeKey__ = key;
    return globalThis.__stripe__;
}
