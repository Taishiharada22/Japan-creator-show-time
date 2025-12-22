// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ===== 型ズレ対策（Stripeの型が古い/ズレている時の保険）=====
 */
type ExpandableId<T extends { id: string }> = string | T | null | undefined;

function idFromExpandable<T extends { id: string }>(v: ExpandableId<T>) {
    if (!v) return null;
    return typeof v === "string" ? v : v.id;
}

type CheckoutSessionPatched = Stripe.Checkout.Session & {
    subscription?: ExpandableId<Stripe.Subscription>;
    customer?: ExpandableId<Stripe.Customer>;
};

type InvoicePatched = Stripe.Invoice & {
    subscription?: ExpandableId<Stripe.Subscription>;
    customer?: ExpandableId<Stripe.Customer>;
};

type SubscriptionPatched = Stripe.Subscription & {
    customer?: ExpandableId<Stripe.Customer>;
};

/**
 * ✅ status を Stripe から来る値 → DB用に正規化
 */
function normalizeStatus(s: Stripe.Subscription.Status) {
    if (s === "active" || s === "trialing") return "active";
    if (s === "past_due" || s === "unpaid") return "past_due";
    if (s === "canceled") return "canceled";
    return "past_due";
}

/**
 * ✅ user_id 解決（metadata.user_id が最優先、無ければ profiles.stripe_customer_id で引く）
 */
async function resolveUserId(params: {
    customerId?: string | null;
    metadataUserId?: string | null;
}) {
    const { customerId, metadataUserId } = params;

    // 1) metadata.user_id が最優先
    if (metadataUserId) return metadataUserId;

    // 2) fallback: profiles.stripe_customer_id から user を引く
    if (customerId) {
        const { data, error } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();

        if (!error && data?.id) return data.id;
    }
    return null;
}

/**
 * ✅ user_subscriptions に upsert
 * 前提: user_subscriptions.stripe_subscription_id に UNIQUE or PK がある
 */
async function upsertSubscriptionRow(input: {
    userId: string;
    customerId: string | null;
    subscription: Stripe.Subscription;
}) {
    const { userId, customerId, subscription } = input;

    // price_id（基本は1つ目）
    const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

    // current_period_end（秒）→ ISO
    const currentPeriodEndSec = (subscription as any)?.current_period_end;
    const currentPeriodEnd =
        typeof currentPeriodEndSec === "number"
            ? new Date(currentPeriodEndSec * 1000).toISOString()
            : null;

    const cancelAtPeriodEnd = !!(subscription as any)?.cancel_at_period_end;
    const status = normalizeStatus(subscription.status);

    const payload = {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        price_id: priceId,
        status,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
        .from("user_subscriptions")
        .upsert(payload, { onConflict: "stripe_subscription_id" });

    if (error) {
        console.error("user_subscriptions upsert error:", error, payload);
        throw error;
    }
}

/**
 * ✅ subscriptionId で status だけ更新
 */
async function setStatusBySubscriptionId(subscriptionId: string, status: string) {
    const { error } = await supabaseAdmin
        .from("user_subscriptions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscriptionId);

    if (error) {
        console.error("user_subscriptions update error:", error, {
            subscriptionId,
            status,
        });
        throw error;
    }
}

export async function POST(req: Request) {
    // ✅ ここで初めて Stripe を初期化（import時クラッシュ回避）
    let stripe: Stripe;
    try {
        stripe = getStripe();
    } catch (e: any) {
        console.error("getStripe() failed:", e?.message ?? e);
        return NextResponse.json(
            { error: e?.message ?? "Stripe init failed (check STRIPE_SECRET_KEY)" },
            { status: 500 }
        );
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
        return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }

    // ✅ 署名検証（raw body 必須）
    let event: Stripe.Event;
    try {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
            return NextResponse.json(
                { error: "STRIPE_WEBHOOK_SECRET is missing (set whsec_... in .env.local / Vercel env)" },
                { status: 500 }
            );
        }

        const rawBody = Buffer.from(await req.arrayBuffer());
        event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (err: any) {
        console.error("Webhook signature verify failed:", err?.message ?? err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    try {
        switch (event.type) {
            /**
             * ✅ 初回決済完了（Checkout）
             */
            case "checkout.session.completed": {
                const session = event.data.object as CheckoutSessionPatched;

                const customerId =
                    idFromExpandable(session.customer) ??
                    ((session.customer as unknown) as string | null) ??
                    null;

                const subscriptionId =
                    idFromExpandable(session.subscription) ??
                    ((session.subscription as unknown) as string | null) ??
                    null;

                const metadataUserId = session.metadata?.user_id ?? null;

                const userId = await resolveUserId({ customerId, metadataUserId });
                if (!userId) {
                    console.error("No userId resolved for checkout.session.completed", {
                        customerId,
                        subscriptionId,
                        metadataUserId,
                        sessionId: session.id,
                    });
                    // ✅ 失敗でも Stripe に再送させたくないケースなので 200 返す
                    return NextResponse.json({ received: true, ignored: true });
                }

                if (!subscriptionId) {
                    console.error("No subscriptionId on checkout.session.completed", {
                        sessionId: session.id,
                        customerId,
                    });
                    return NextResponse.json({ received: true, ignored: true });
                }

                // Stripe から subscription を取り直してDB反映
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);

                await upsertSubscriptionRow({
                    userId,
                    customerId,
                    subscription,
                });

                break;
            }

            /**
             * ✅ サブスク作成/更新（プラン変更、支払い状況変化、期間更新など）
             */
            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const subscription = event.data.object as SubscriptionPatched;

                const customerId =
                    idFromExpandable(subscription.customer) ??
                    ((subscription.customer as unknown) as string | null) ??
                    null;

                const metadataUserId = subscription.metadata?.user_id ?? null;

                const userId = await resolveUserId({ customerId, metadataUserId });
                if (!userId) {
                    console.error("No userId resolved for subscription event", {
                        type: event.type,
                        customerId,
                        subscriptionId: subscription.id,
                    });
                    return NextResponse.json({ received: true, ignored: true });
                }

                await upsertSubscriptionRow({
                    userId,
                    customerId,
                    subscription: subscription as Stripe.Subscription,
                });

                break;
            }

            /**
             * ✅ 解約（Stripe側で削除）
             */
            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                await setStatusBySubscriptionId(subscription.id, "canceled");
                break;
            }

            /**
             * ✅ 支払い失敗 → past_due
             */
            case "invoice.payment_failed": {
                const invoice = event.data.object as InvoicePatched;

                const subscriptionId =
                    idFromExpandable(invoice.subscription) ??
                    ((invoice.subscription as unknown) as string | null) ??
                    null;

                if (subscriptionId) {
                    await setStatusBySubscriptionId(subscriptionId, "past_due");
                }
                break;
            }

            /**
             * ✅ 支払い成功 → active
             */
            case "invoice.paid": {
                const invoice = event.data.object as InvoicePatched;

                const subscriptionId =
                    idFromExpandable(invoice.subscription) ??
                    ((invoice.subscription as unknown) as string | null) ??
                    null;

                if (subscriptionId) {
                    await setStatusBySubscriptionId(subscriptionId, "active");
                }
                break;
            }

            default:
                // ✅ 未対応イベントは 200 で返す（Stripeの再送地獄を避ける）
                break;
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        console.error("Webhook handler error:", event?.type, err?.message ?? err);
        return NextResponse.json(
            { error: err?.message ?? "Webhook handler failed" },
            { status: 500 }
        );
    }
}
