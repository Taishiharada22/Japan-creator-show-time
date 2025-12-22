// app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = getStripe();

function getOrigin(req: Request) {
    const h = req.headers;
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${proto}://${host}`;
    return new URL(req.url).origin;
}

function safePath(p: string) {
    // "/subscription" みたいなパスだけ許可（外部URL注入防止）
    if (!p) return "/subscription";
    if (!p.startsWith("/")) return "/subscription";
    if (p.startsWith("//")) return "/subscription";
    return p;
}

async function getAuthedUser(req: Request) {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;

    const token = m[1];
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user; // { id, email, ... }
}

async function getOrCreateStripeCustomerId(userId: string, email?: string | null) {
    const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

    if (profErr) throw profErr;

    if (prof?.stripe_customer_id) return prof.stripe_customer_id as string;

    const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: { user_id: userId },
    });

    const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", userId);

    if (upErr) throw upErr;

    return customer.id;
}

export async function POST(req: Request) {
    try {
        const user = await getAuthedUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => ({}));

        // planId or planCode のどちらでもOKにする（運用が楽）
        const planId = String(body?.planId ?? "").trim();
        const planCode = String(body?.planCode ?? "").trim();

        const returnPath = safePath(String(body?.returnPath ?? "/subscription"));

        if (!planId && !planCode) {
            return NextResponse.json({ error: "planId or planCode is required" }, { status: 400 });
        }

        // ✅ DBから plan を取る（id優先、なければcode）
        const q = supabaseAdmin
            .from("subscription_plans")
            .select("id, code, name, monthly_price_jpy, stripe_price_id")
            .limit(1);

        const { data: plan, error: planErr } = planId
            ? await q.eq("id", planId).maybeSingle()
            : await q.eq("code", planCode).maybeSingle();

        if (planErr || !plan) {
            return NextResponse.json({ error: "plan not found" }, { status: 404 });
        }

        const priceId = (plan as any).stripe_price_id as string | null;
        if (!priceId) {
            // 無料プラン or 未設定
            return NextResponse.json(
                { error: "This plan has no stripe_price_id (free plan or not purchasable yet)." },
                { status: 400 }
            );
        }

        const origin = getOrigin(req);
        const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],

            success_url: `${origin}/account?checkout=success`,
            cancel_url: `${origin}${returnPath}?checkout=cancel`,

            // webhookで userId / plan を確実に特定
            metadata: {
                user_id: user.id,
                plan_id: (plan as any).id,
                plan_code: (plan as any).code ?? "",
            },
            subscription_data: {
                metadata: {
                    user_id: user.id,
                    plan_id: (plan as any).id,
                    plan_code: (plan as any).code ?? "",
                },
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error("failed to create checkout:", err);
        return NextResponse.json(
            { error: err?.message ?? "failed to create checkout" },
            { status: 500 }
        );
    }
}
