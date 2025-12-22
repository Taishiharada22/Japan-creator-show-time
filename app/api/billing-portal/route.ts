// app/api/billing-portal/route.ts
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

async function tryGetCustomerIdFromProfiles(userId: string) {
    try {
        const { data, error } = await supabaseAdmin
            .from("profiles")
            .select("stripe_customer_id")
            .eq("id", userId)
            .maybeSingle();

        if (error) throw error;
        return (data?.stripe_customer_id as string | null) ?? null;
    } catch (e) {
        console.error("profiles read failed (fallback to stripe search):", e);
        return null;
    }
}

async function trySaveCustomerIdToProfiles(userId: string, customerId: string) {
    try {
        const { error } = await supabaseAdmin
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .eq("id", userId);

        if (error) throw error;
    } catch (e) {
        console.error("profiles update failed (ignored):", e);
    }
}

async function findCustomerByMetadata(userId: string, email?: string | null) {
    const stripe = getStripe();

    // まず metadata で検索（推奨）
    try {
        const r = await stripe.customers.search({
            query: `metadata['supabase_user_id']:'${userId}'`,
            limit: 1,
        });
        return r.data[0]?.id ?? null;
    } catch (e) {
        console.error("stripe.customers.search failed (fallback to email list):", e);
    }

    // フォールバック：email で list
    if (email) {
        const list = await stripe.customers.list({ email, limit: 1 });
        return list.data[0]?.id ?? null;
    }

    return null;
}

async function getOrCreateStripeCustomerId(userId: string, email?: string | null) {
    const stripe = getStripe();

    // 1) profiles から取得（あればそれを採用）
    let customerId = await tryGetCustomerIdFromProfiles(userId);
    if (customerId) return customerId;

    // 2) Stripe側で既存顧客を探す（DBが壊れてても復旧できる）
    customerId = await findCustomerByMetadata(userId, email);
    if (customerId) {
        await trySaveCustomerIdToProfiles(userId, customerId);
        return customerId;
    }

    // 3) なければ作成
    const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: { supabase_user_id: userId },
    });

    await trySaveCustomerIdToProfiles(userId, customer.id);
    return customer.id;
}

export async function POST(req: Request) {
    try {
        const auth = req.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

        if (!token) {
            return NextResponse.json({ error: "missing token" }, { status: 401 });
        }

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) {
            return NextResponse.json({ error: "invalid session" }, { status: 401 });
        }

        const user = data.user;
        const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

        const stripe = getStripe();
        const origin = getOrigin(req);

        const portal = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}/account`,
        });

        return NextResponse.json({ url: portal.url });
    } catch (e: any) {
        console.error("billing-portal error:", e);
        return NextResponse.json(
            { error: e?.message ?? "billing portal failed" },
            { status: 500 }
        );
    }
}
