// app/api/stripe/portal/route.ts
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

export async function POST(req: Request) {
    try {
        const stripe = getStripe();

        const auth = req.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });

        const user = data.user;

        const { returnPath } = (await req.json().catch(() => ({}))) as { returnPath?: string };

        const origin = getOrigin(req);
        const baseBack = `${origin}${returnPath && returnPath.startsWith("/") ? returnPath : "/subscription"}`;
        const back = withStripeReturn(baseBack);

        const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

        const portal = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: back,
        });

        return NextResponse.json({ url: portal.url });
    } catch (e: any) {
        console.error("portal error:", e);
        return NextResponse.json({ error: e?.message ?? "portal failed" }, { status: 500 });
    }
}
