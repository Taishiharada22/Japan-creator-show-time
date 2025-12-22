// app/api/billing-portal/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";

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

async function getAuthedUserId(req: Request) {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;

    const token = m[1];
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) return null;

    return data.user.id;
}

async function getStripeCustomerIdOrThrow(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

    if (error) throw error;
    const customerId = data?.stripe_customer_id ?? null;

    if (!customerId) {
        throw new Error("stripe_customer_id is missing on profiles");
    }

    return customerId;
}

export async function POST(req: Request) {
    try {
        const userId = await getAuthedUserId(req);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const origin = getOrigin(req);
        const customerId = await getStripeCustomerIdOrThrow(userId);

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}/account`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error("billing-portal error:", err?.message ?? err);
        return NextResponse.json({ error: "billing-portal failed" }, { status: 500 });
    }
}
