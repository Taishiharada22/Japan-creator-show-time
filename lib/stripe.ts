// lib/stripe.ts
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe() {
    if (_stripe) return _stripe;

    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing");

    // apiVersion を固定したい場合はここで指定（任意）
    // _stripe = new Stripe(key, { apiVersion: "2024-06-20" as any });

    _stripe = new Stripe(key);

    return _stripe;
}
