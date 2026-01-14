// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ===== Stripe 型ズレ吸収 ===== */
function idFromExpandable(v: any): string | null {
    if (!v) return null;
    return typeof v === "string" ? v : typeof v === "object" ? (v.id ?? null) : null;
}
function isDeletedProduct(obj: any): boolean {
    return !!obj && typeof obj === "object" && obj.deleted === true;
}

/** ===== subscription（既存のまま） ===== */
function mapSubStatus(s: any): "active" | "past_due" | "canceled" {
    if (s === "active" || s === "trialing") return "active";
    if (s === "past_due" || s === "unpaid" || s === "incomplete") return "past_due";
    if (s === "canceled" || s === "incomplete_expired" || s === "paused") return "canceled";
    return "past_due";
}
type PlanRow = { id: string; target: "buyer" | "creator" | "bundle" };

async function findUserIdByCustomerId(customerId: string) {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
}
function productIdFromSubscription(sub: any): string | null {
    const item = sub?.items?.data?.[0] ?? null;
    const price = item?.price ?? null;
    const prod = price?.product ?? null;
    return idFromExpandable(prod);
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
async function upsertUserSubscription(params: {
    userId: string;
    plan: PlanRow;
    status: "active" | "past_due" | "canceled";
}) {
    const { userId, plan, status } = params;

    const { data: rows, error: actErr } = await supabaseAdmin
        .from("user_subscriptions")
        .select(
            `
      id,
      plan_id,
      status,
      subscription_plans ( id, target )
    `
        )
        .eq("user_id", userId);

    if (actErr) throw actErr;

    const list = (rows ?? []) as any[];
    const sameTarget = list.filter((r) => r.subscription_plans?.target === plan.target);
    const toCancel = sameTarget
        .filter((r) => (r.status === "active" || r.status === "past_due") && r.plan_id !== plan.id)
        .map((r) => r.id);

    if (toCancel.length > 0) {
        const { error: cancelErr } = await supabaseAdmin
            .from("user_subscriptions")
            .update({ status: "canceled" })
            .in("id", toCancel);
        if (cancelErr) throw cancelErr;
    }

    const { data: existing, error: exErr } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("plan_id", plan.id)
        .maybeSingle();

    if (exErr) throw exErr;

    if (existing?.id) {
        const { error: upErr } = await supabaseAdmin
            .from("user_subscriptions")
            .update({ status })
            .eq("id", existing.id);
        if (upErr) throw upErr;
    } else {
        const { error: insErr } = await supabaseAdmin
            .from("user_subscriptions")
            .insert({ user_id: userId, plan_id: plan.id, status });
        if (insErr) throw insErr;
    }
}

/** ===== payment（物販）: product metadata から supabase_product_id を抜く ===== */
function supabaseProductIdFromLineItem(li: any): string | null {
    const price = li?.price ?? null;
    const prod = price?.product ?? null;

    if (!prod || typeof prod === "string") return null;
    if (isDeletedProduct(prod)) return null;

    const meta = prod?.metadata ?? null;
    const v = meta?.supabase_product_id ?? null;
    return typeof v === "string" && v.length > 0 ? v : null;
}

/** ===== shop_orders status ===== */
type OrderStatus = "pending" | "paid" | "failed" | "canceled" | "partially_refunded" | "refunded";
function isFinalRefunded(s: any) {
    const v = String(s ?? "").toLowerCase();
    return v === "refunded" || v === "partially_refunded";
}

/** ✅ 購入後：そのユーザーの active cart を全部掃除（重複active対策） */
async function cleanupAllActiveCartsForUser(userId: string, sessionId: string) {
    const { data: carts, error: cartErr } = await supabaseAdmin
        .from("shop_carts")
        .select("id,status")
        .eq("user_id", userId)
        .eq("status", "active");

    if (cartErr) throw cartErr;

    const ids = (carts ?? []).map((c: any) => c.id).filter(Boolean);
    if (ids.length === 0) {
        console.log("[cart cleanup] no active carts", { sessionId, userId });
        return;
    }

    const { data: deleted, error: delErr } = await supabaseAdmin
        .from("shop_cart_items")
        .delete()
        .in("cart_id", ids)
        .select("id");
    if (delErr) throw delErr;

    const { error: upErr } = await supabaseAdmin
        .from("shop_carts")
        .update({ status: "ordered" })
        .in("id", ids);
    if (upErr) throw upErr;

    console.log("[cart cleanup] cleared active carts", {
        sessionId,
        userId,
        cartIds: ids,
        deletedCount: Array.isArray(deleted) ? deleted.length : 0,
    });
}

/**
 * ✅ maybeSingle() を避ける：重複があっても落ちない
 */
async function getOrderBySessionId(sessionId: string) {
    const { data, error } = await supabaseAdmin
        .from("shop_orders")
        .select("id,status,amount_total_minor,amount_refunded_minor,created_at,stripe_charge_id")
        .eq("stripe_checkout_session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) throw error;
    return Array.isArray(data) ? (data[0] as any) ?? null : (data as any) ?? null;
}
async function getOrderByPaymentIntentId(piId: string) {
    const { data, error } = await supabaseAdmin
        .from("shop_orders")
        .select("id,status,amount_total_minor,amount_refunded_minor,created_at,stripe_charge_id")
        .eq("stripe_payment_intent_id", piId)
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) throw error;
    return Array.isArray(data) ? (data[0] as any) ?? null : (data as any) ?? null;
}

async function updateOrderStatus(orderId: string, next: OrderStatus, patch: Record<string, any> = {}) {
    const { data: cur, error: curErr } = await supabaseAdmin
        .from("shop_orders")
        .select("id,status,amount_total_minor,amount_refunded_minor,stripe_charge_id")
        .eq("id", orderId)
        .maybeSingle();
    if (curErr) throw curErr;

    const curStatus = cur?.status;

    // 返金済みを下書き戻ししない
    if (
        isFinalRefunded(curStatus) &&
        (next === "failed" || next === "canceled" || next === "pending" || next === "paid")
    ) {
        return;
    }
    // paid を failed に落とさない（原則）
    if (String(curStatus).toLowerCase() === "paid" && next === "failed") {
        return;
    }

    // ✅ stripe_charge_id を NULL で上書きしない（patchにnullが来たら落とす）
    const safePatch = { ...patch };
    if ("stripe_charge_id" in safePatch && !safePatch.stripe_charge_id) {
        delete safePatch.stripe_charge_id;
    }

    const { error: upErr } = await supabaseAdmin
        .from("shop_orders")
        .update({ status: next, ...safePatch })
        .eq("id", orderId);
    if (upErr) throw upErr;
}

/** ✅ 支払い成功：stripe_charge_id を確実に保存しておく（返金がchargeベースでも紐付く） */
async function ensurePaidOrderFromCheckoutSession(stripe: any, sessionId: string) {
    const full = (await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price.product", "payment_intent"],
    })) as any;

    if (full?.mode !== "payment") return;

    const paid =
        full?.payment_status === "paid" ||
        full?.status === "complete" ||
        (typeof full?.amount_total === "number" && full.amount_total > 0);

    if (!paid) return;

    const userIdFromMeta = (full?.metadata?.supabase_user_id as string | undefined) ?? null;

    const customerId = idFromExpandable(full?.customer);
    const userId = userIdFromMeta ?? (customerId ? await findUserIdByCustomerId(customerId) : null);

    if (!userId) {
        console.warn("payment webhook: user not found for session:", full?.id);
        return;
    }

    const currency = String(full?.currency ?? "jpy").toUpperCase();
    const subtotal = Number(full?.amount_subtotal ?? 0);
    const total = Number(full?.amount_total ?? 0);

    const paymentIntentId = idFromExpandable(full?.payment_intent);

    // ✅ stripe_charge_id を確実に取る（失敗しても致命にしない）
    let chargeId: string | null = null;
    try {
        // payment_intent が expand されてる時、latest_charge が取れる場合がある
        if (full?.payment_intent && typeof full.payment_intent === "object") {
            chargeId = idFromExpandable(full.payment_intent?.latest_charge) ?? null;
        }

        // latest_charge が無い/取れないなら PI を取り直して charges から拾う
        if (!chargeId && paymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
                expand: ["charges.data"],
            });
            chargeId =
                (pi?.charges?.data?.[0]?.id as string | undefined) ??
                idFromExpandable((pi as any)?.latest_charge) ??
                null;
        }
    } catch (e: any) {
        console.error("[payment] paymentIntents.retrieve failed", {
            sessionId,
            paymentIntentId,
            msg: e?.message ?? e,
        });
        // chargeId は null のまま続行（注文作成自体は止めない）
    }

    // 既存注文があれば paid にして、足りないIDを埋める
    const exists = await getOrderBySessionId(full.id);
    if (exists?.id) {
        const patch: Record<string, any> = {};
        if (paymentIntentId) patch.stripe_payment_intent_id = paymentIntentId;
        if (chargeId) patch.stripe_charge_id = chargeId;

        await updateOrderStatus(exists.id, "paid", patch);
        await cleanupAllActiveCartsForUser(userId, String(full.id));
        return;
    }

    const { data: order, error: ordErr } = await supabaseAdmin
        .from("shop_orders")
        .insert({
            user_id: userId,
            status: "paid",
            currency,
            amount_subtotal_minor: subtotal,
            amount_total_minor: total,
            stripe_checkout_session_id: full.id,
            stripe_payment_intent_id: paymentIntentId,
            stripe_charge_id: chargeId, // ✅ ここが今回の追加
        })
        .select("id")
        .single();
    if (ordErr) throw ordErr;

    const orderId = order.id as string;

    const lineItems = (full?.line_items?.data ?? []) as any[];
    const rows = lineItems
        .map((li) => {
            const supaProdId = supabaseProductIdFromLineItem(li);
            if (!supaProdId) return null;

            const qty = Number(li?.quantity ?? 1);
            const unit = Number(li?.price?.unit_amount ?? 0);

            return {
                order_id: orderId,
                product_id: supaProdId,
                quantity: qty,
                unit_price_minor: unit,
                currency,
            };
        })
        .filter(Boolean) as any[];

    if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin
            .from("shop_order_items")
            .upsert(rows, { onConflict: "order_id,product_id" });
        if (insErr) throw insErr;
    }

    await cleanupAllActiveCartsForUser(userId, String(full.id));
}

/** ===== 失敗/キャンセル ===== */
async function markFailedBySessionId(sessionId: string) {
    const o = await getOrderBySessionId(sessionId);
    if (!o?.id) return;
    if (isFinalRefunded(o.status)) return;
    await updateOrderStatus(o.id, "failed");
}
async function markFailedByPaymentIntentId(piId: string) {
    const o = await getOrderByPaymentIntentId(piId);
    if (!o?.id) return;
    if (isFinalRefunded(o.status)) return;
    await updateOrderStatus(o.id, "failed");
}
async function markCanceledBySessionId(sessionId: string) {
    const o = await getOrderBySessionId(sessionId);
    if (!o?.id) return;
    if (isFinalRefunded(o.status)) return;
    await updateOrderStatus(o.id, "canceled");
}

/** ===== 返金（冪等）===== */
async function applyRefundFromCharge(charge: any) {
    const piId = idFromExpandable(charge?.payment_intent);
    const chargeId = String(charge?.id ?? "");
    const refundedTotal = Number(charge?.amount_refunded ?? 0); // ✅ 合計返金額（冪等）

    let order: any | null = null;
    if (piId) order = await getOrderByPaymentIntentId(piId);

    if (!order && chargeId) {
        const { data, error } = await supabaseAdmin
            .from("shop_orders")
            .select("id,status,amount_total_minor,amount_refunded_minor,created_at")
            .eq("stripe_charge_id", chargeId)
            .order("created_at", { ascending: false })
            .limit(1);

        if (error) throw error;
        order = Array.isArray(data) ? (data[0] as any) ?? null : (data as any) ?? null;
    }

    if (!order?.id) return;

    const total = Number(order?.amount_total_minor ?? 0);
    const next: OrderStatus =
        total > 0 && refundedTotal > 0 && refundedTotal < total ? "partially_refunded" : "refunded";

    await updateOrderStatus(order.id, next, {
        amount_refunded_minor: refundedTotal,
        refunded_at: new Date().toISOString(),
        stripe_charge_id: chargeId || null,
    });
}

async function applyRefundFromRefundObject(stripe: any, refund: any) {
    const chargeId = String(refund?.charge ?? "");
    const refundId = String(refund?.id ?? "");
    if (!chargeId) return;

    // ✅ refund → charge を取得 → charge.amount_refunded（合計）で上書きするので冪等
    let ch: any;
    try {
        ch = (await stripe.charges.retrieve(chargeId, { expand: ["payment_intent"] })) as any;
    } catch (e: any) {
        console.error("[refund] charge retrieve failed", { chargeId, refundId, msg: e?.message ?? e });
        return; // retrieveできない時に500にしない（次のイベントで追いつける）
    }

    await applyRefundFromCharge(ch);

    // 付帯情報：最新 refund id を記録（無くても致命ではない）
    const piId = idFromExpandable(ch?.payment_intent);
    if (!piId) return;

    const o = await getOrderByPaymentIntentId(piId);
    if (!o?.id) return;

    const { error } = await supabaseAdmin
        .from("shop_orders")
        .update({ stripe_latest_refund_id: refundId })
        .eq("id", o.id);

    if (error) throw error;
}

/** ===== Webhookイベント冪等（evt_ 重複防止） ===== */
async function claimStripeEventOnce(event: Stripe.Event) {
    const evId = event.id;
    const row = {
        id: evId,
        type: event.type,
        livemode: !!(event as any).livemode,
        stripe_created:
            typeof (event as any).created === "number"
                ? new Date((event as any).created * 1000).toISOString()
                : null,
        status: "processing", // received/processing/processed/error
        error: null,
        processed_at: null,
    };

    // 1) まず insert を試す
    const { error: insErr } = await supabaseAdmin.from("stripe_webhook_events").insert(row);
    if (!insErr) return { shouldProcess: true, isFirst: true };

    // 2) duplicate key なら既存を確認
    const dup = (insErr as any)?.code === "23505" || (insErr as any)?.status === 409;
    if (!dup) throw insErr;

    const { data: existing, error: selErr } = await supabaseAdmin
        .from("stripe_webhook_events")
        .select("id,status")
        .eq("id", evId)
        .maybeSingle();
    if (selErr) throw selErr;

    const st = String((existing as any)?.status ?? "");
    if (st === "processed") {
        return { shouldProcess: false, isFirst: false, status: st };
    }

    // processed 以外（received/error/processing）は再処理させる
    const { error: upErr } = await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ status: "processing", error: null, processed_at: null })
        .eq("id", evId);
    if (upErr) throw upErr;

    return { shouldProcess: true, isFirst: false, status: st };
}

async function markStripeEventProcessed(eventId: string) {
    const { error } = await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", eventId);
    if (error) throw error;
}

async function markStripeEventError(eventId: string, msg: string) {
    const { error } = await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ status: "error", error: msg, processed_at: new Date().toISOString() })
        .eq("id", eventId);
    if (error) throw error;
}

/** ===== handler ===== */
export async function POST(req: Request) {
    const stripe = getStripe();
    const sig = req.headers.get("stripe-signature");
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !whsec) {
        return NextResponse.json({ error: "missing stripe webhook config" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        const payload = await req.text();
        event = stripe.webhooks.constructEvent(payload, sig, whsec);
    } catch (err: any) {
        console.error("webhook signature verify failed:", err?.message ?? err);
        return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }

    const evId = String((event as any)?.id ?? "");
    const eventType = String((event as any)?.type ?? "");
    const livemode = !!(event as any)?.livemode;

    console.log("[stripe webhook] in", { evId, eventType, livemode });

    // ✅ evt_ 重複対策：同じイベントは1回だけ処理
    let claimed = false;
    try {
        const claim = await claimStripeEventOnce(event);
        claimed = claim.shouldProcess;

        if (!claim.shouldProcess) {
            return NextResponse.json({ received: true, duplicate: true });
        }
    } catch (e: any) {
        console.error("[stripe webhook] claim error", { evId, msg: e?.message ?? e });
        return NextResponse.json({ error: e?.message ?? "claim failed" }, { status: 500 });
    }

    try {
        switch (eventType) {
            /** ===== subscription sync ===== */
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
                const sub = event.data.object as any;

                const customerId = idFromExpandable(sub?.customer);
                if (!customerId) break;

                const userId = await findUserIdByCustomerId(customerId);
                if (!userId) break;

                const prodId = productIdFromSubscription(sub);
                if (!prodId) break;

                const plan = await resolvePlanByProduct(prodId);
                if (!plan) break;

                const status = mapSubStatus(sub?.status);
                await upsertUserSubscription({ userId, plan, status });
                break;
            }

            case "invoice.paid":
            case "invoice.payment_failed": {
                const inv = event.data.object as any;

                const subId = idFromExpandable(inv?.subscription);
                if (!subId) break;

                const sub = (await stripe.subscriptions.retrieve(subId, {
                    expand: ["items.data.price.product"],
                })) as any;

                const customerId = idFromExpandable(sub?.customer);
                if (!customerId) break;

                const userId = await findUserIdByCustomerId(customerId);
                if (!userId) break;

                const prodId = productIdFromSubscription(sub);
                if (!prodId) break;

                const plan = await resolvePlanByProduct(prodId);
                if (!plan) break;

                const status = eventType === "invoice.paid" ? "active" : "past_due";
                await upsertUserSubscription({ userId, plan, status });
                break;
            }

            /** ===== payment order (success) ===== */
            case "checkout.session.completed":
            case "checkout.session.async_payment_succeeded": {
                const s = event.data.object as any;
                if (s?.id) await ensurePaidOrderFromCheckoutSession(stripe, String(s.id));
                break;
            }

            /** ===== payment failed / canceled ===== */
            case "checkout.session.async_payment_failed": {
                const s = event.data.object as any;
                if (s?.id) await markFailedBySessionId(String(s.id));
                break;
            }
            case "checkout.session.expired": {
                const s = event.data.object as any;
                if (s?.id) await markCanceledBySessionId(String(s.id));
                break;
            }
            case "payment_intent.payment_failed": {
                const pi = event.data.object as any;
                const piId = String(pi?.id ?? "");
                if (piId) await markFailedByPaymentIntentId(piId);
                break;
            }

            /** ===== refund ===== */
            case "charge.refunded": {
                const ch = event.data.object as any;
                await applyRefundFromCharge(ch);
                break;
            }

            case "refund.created":
            case "refund.updated":
            case "charge.refund.updated":
            case "charge.refund.created": {
                const rf = event.data.object as any;
                await applyRefundFromRefundObject(stripe, rf);
                break;
            }

            default:
                break;
        }

        // ✅ 成功したら processed
        await markStripeEventProcessed(evId);

        return NextResponse.json({ received: true });
    } catch (e: any) {
        console.error("webhook handler error:", { evId, eventType, msg: e?.message ?? e });
        // ✅ 失敗は error で残す（Stripeがリトライする）
        try {
            await markStripeEventError(evId, e?.message ?? String(e));
        } catch (markErr: any) {
            console.error("[stripe webhook] failed to mark error:", markErr?.message ?? markErr);
        }

        return NextResponse.json({ error: e?.message ?? "webhook failed" }, { status: 500 });
    } finally {
        void claimed;
    }
}
