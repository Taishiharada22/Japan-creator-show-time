// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(req: Request) {
    const h = req.headers;
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${proto}://${host}`;
    return new URL(req.url).origin;
}

function withStripeReturn(urlStr: string) {
    const u = new URL(urlStr);
    u.searchParams.set("stripe", "1");
    return u.toString();
}

async function getOrCreateStripeCustomerId(userId: string, email?: string | null) {
    const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

    if (profErr) throw profErr;

    let customerId = (prof?.stripe_customer_id as string | null) ?? null;

    if (!customerId) {
        const stripe = getStripe();
        const customer = await stripe.customers.create({
            email: email ?? undefined,
            metadata: { supabase_user_id: userId },
        });

        customerId = customer.id;

        const { error: upErr } = await supabaseAdmin
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .eq("id", userId);

        if (upErr) throw upErr;
    }

    return customerId;
}

async function resolveMonthlyPriceIdFromProduct(params: { productId: string; currency: "JPY" | "USD" }) {
    const stripe = getStripe();
    const currency = params.currency.toLowerCase();

    const prices = await stripe.prices.list({
        product: params.productId,
        active: true,
        limit: 100,
    });

    const picked =
        prices.data.find(
            (p) =>
                p.active &&
                p.type === "recurring" &&
                p.recurring?.interval === "month" &&
                p.currency === currency
        ) ??
        prices.data.find((p) => p.active && p.type === "recurring" && p.recurring?.interval === "month");

    return picked?.id ?? null;
}

export async function POST(req: Request) {
    try {
        const stripe = getStripe();

        const auth = req.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });

        const user = data.user;

        const { planId, returnPath } = (await req.json().catch(() => ({}))) as {
            planId?: string;
            returnPath?: string;
        };
        if (!planId) return NextResponse.json({ error: "missing planId" }, { status: 400 });

        const { data: plan, error: planErr } = await supabaseAdmin
            .from("subscription_plans")
            .select("id, code, target, currency, monthly_price_minor, stripe_price_id, stripe_product_id, is_active")
            .eq("id", planId)
            .maybeSingle();

        if (planErr || !plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });
        if (plan.is_active === false) return NextResponse.json({ error: `plan "${plan.code}" is not active` }, { status: 400 });
        if ((plan.monthly_price_minor ?? 0) <= 0) return NextResponse.json({ error: `plan "${plan.code}" is not paid` }, { status: 400 });

        let priceId: string | null = plan.stripe_price_id ?? null;

        if (!priceId) {
            const productId = plan.stripe_product_id ?? null;
            if (!productId) {
                return NextResponse.json(
                    { error: `missing stripe identifiers for plan code="${plan.code}". Set subscription_plans.stripe_price_id OR stripe_product_id` },
                    { status: 400 }
                );
            }

            priceId = await resolveMonthlyPriceIdFromProduct({
                productId,
                currency: plan.currency as "JPY" | "USD",
            });

            if (!priceId) {
                return NextResponse.json(
                    { error: `could not find active monthly price for product="${productId}" (plan="${plan.code}")` },
                    { status: 400 }
                );
            }
        }

        const origin = getOrigin(req);
        const baseBack = `${origin}${returnPath && returnPath.startsWith("/") ? returnPath : "/subscription"}`;
        const back = withStripeReturn(baseBack);

        const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: back,
            cancel_url: back,

            metadata: {
                supabase_user_id: user.id,
                plan_id: plan.id,
                plan_code: plan.code,
                plan_target: plan.target,
            },

            subscription_data: {
                metadata: {
                    supabase_user_id: user.id,
                    plan_id: plan.id,
                    plan_code: plan.code,
                    plan_target: plan.target,
                },
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (e: any) {
        console.error("checkout error:", e);
        return NextResponse.json({ error: e?.message ?? "checkout failed" }, { status: 500 });
    }
}
