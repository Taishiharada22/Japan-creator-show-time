// app/api/stripe/sync-subscription/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpandableId<T extends { id: string }> = string | T | null | undefined;

function idFromExpandable<T extends { id: string }>(v: ExpandableId<T>) {
    if (!v) return null;
    return typeof v === "string" ? v : v.id;
}

function mapSubStatus(s: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
    if (s === "active" || s === "trialing") return "active";
    if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
    if (s === "canceled" || s === "incomplete_expired" || s === "paused") return "canceled";
    return "past_due";
}

/**
 * ✅ seconds / ms / string どれでも耐える（取れなければ null）
 * Stripeは通常 seconds（Unix time）だけど、型ズレや環境で崩れても落ちないようにする
 */
function toIsoMaybe(v: unknown): string | null {
    const n =
        typeof v === "number" ? v :
            typeof v === "string" ? Number(v) :
                NaN;

    if (!Number.isFinite(n) || n <= 0) return null;

    // だいたい 1e12 を超えたら ms とみなす（2025年で seconds は 1.7e9 くらい）
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type PlanRow = { id: string; target: "buyer" | "creator" | "bundle" };

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

async function resolvePlanByProduct(productId: string) {
    const { data, error } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, target")
        .eq("stripe_product_id", productId)
        .eq("is_active", true)
        .maybeSingle();

    if (error) throw error;
    return (data as PlanRow | null) ?? null;
}

function productIdFromSubscription(sub: Stripe.Subscription): string | null {
    const item = sub.items.data?.[0];
    const price = item?.price;
    const prod = (price?.product ?? null) as ExpandableId<Stripe.Product>;
    return idFromExpandable(prod);
}

async function upsertUserSubscription(params: {
    userId: string;
    plan: PlanRow;
    status: "active" | "past_due" | "canceled";
    statusRaw: string;
    stripeSubscriptionId: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
}) {
    const nowIso = new Date().toISOString();

    const { error: upErr } = await supabaseAdmin
        .from("user_subscriptions")
        .upsert(
            {
                user_id: params.userId,
                plan_id: params.plan.id,
                status: params.status,
                status_raw: params.statusRaw,
                stripe_subscription_id: params.stripeSubscriptionId,
                current_period_end: params.currentPeriodEnd, // 取れなきゃ null
                cancel_at_period_end: params.cancelAtPeriodEnd,
                updated_at: nowIso,
            },
            { onConflict: "user_id,plan_id" }
        );

    if (upErr) throw upErr;

    // 同じtargetの他プラン active/past_due は canceled
    const { data: rows, error: listErr } = await supabaseAdmin
        .from("user_subscriptions")
        .select(
            `
      id,
      plan_id,
      status,
      subscription_plans ( id, target )
    `
        )
        .eq("user_id", params.userId);

    if (listErr) throw listErr;

    const sameTarget = (rows ?? []).filter((r: any) => r.subscription_plans?.target === params.plan.target);
    const toCancelIds = sameTarget
        .filter((r: any) => (r.status === "active" || r.status === "past_due") && r.plan_id !== params.plan.id)
        .map((r: any) => r.id);

    if (toCancelIds.length > 0) {
        const { error: cancelErr } = await supabaseAdmin
            .from("user_subscriptions")
            .update({ status: "canceled", updated_at: nowIso })
            .in("id", toCancelIds);

        if (cancelErr) throw cancelErr;
    }
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
        const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

        const subs = await stripe.subscriptions.list({
            customer: customerId,
            status: "all",
            limit: 10,
            expand: ["data.items.data.price.product"],
        });

        const bestByTarget = new Map<
            string,
            {
                plan: PlanRow;
                status: "active" | "past_due" | "canceled";
                statusRaw: string;
                stripeSubscriptionId: string;
                currentPeriodEnd: string | null;
                cancelAtPeriodEnd: boolean;
                score: number;
                created: number;
            }
        >();

        function scoreOf(st: "active" | "past_due" | "canceled") {
            if (st === "active") return 3;
            if (st === "past_due") return 2;
            return 1;
        }

        for (const sub of subs.data) {
            const prodId = productIdFromSubscription(sub);
            if (!prodId) continue;

            const plan = await resolvePlanByProduct(prodId);
            if (!plan) continue;

            const st = mapSubStatus(sub.status);
            const score = scoreOf(st);
            const created = sub.created ?? 0;

            // ✅ 型ズレ回避
            const subAny = sub as any;
            const currentPeriodEnd = toIsoMaybe(subAny.current_period_end);
            const cancelAtPeriodEnd = Boolean(subAny.cancel_at_period_end);

            const candidate = {
                plan,
                status: st,
                statusRaw: sub.status,
                stripeSubscriptionId: sub.id,
                currentPeriodEnd,
                cancelAtPeriodEnd,
                score,
                created,
            };

            const key = plan.target;
            const cur = bestByTarget.get(key);
            if (!cur || score > cur.score || (score === cur.score && created > cur.created)) {
                bestByTarget.set(key, candidate);
            }
        }

        const updatedTargets: string[] = [];

        for (const [target, v] of bestByTarget.entries()) {
            await upsertUserSubscription({
                userId: user.id,
                plan: v.plan,
                status: v.status,
                statusRaw: v.statusRaw,
                stripeSubscriptionId: v.stripeSubscriptionId,
                currentPeriodEnd: v.currentPeriodEnd,
                cancelAtPeriodEnd: v.cancelAtPeriodEnd,
            });
            updatedTargets.push(target);
        }

        return NextResponse.json({ ok: true, updatedTargets });
    } catch (e: any) {
        console.error("sync-subscription error:", e);
        return NextResponse.json({ error: e?.message ?? "sync failed" }, { status: 500 });
    }
}
