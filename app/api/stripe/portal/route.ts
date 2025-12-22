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

async function getAuthedUser(req: Request) {
    const auth = req.headers.get("authorization") ?? "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;

    const token = m[1];
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;

    return data.user;
}

async function getStripeCustomerId(userId: string) {
    const { data: prof, error } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

    if (error) throw error;
    return (prof?.stripe_customer_id as string | null) ?? null;
}

export async function POST(req: Request) {
    try {
        const user = await getAuthedUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const returnPath = String(body?.returnPath ?? "/subscription");

        const customerId = await getStripeCustomerId(user.id);
        if (!customerId) {
            return NextResponse.json(
                { error: "No stripe_customer_id. Please start checkout at least once." },
                { status: 400 }
            );
        }

        const origin = getOrigin(req);
        const stripe = getStripe();

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}${returnPath}`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error("failed to open portal:", err);
        return NextResponse.json({ error: err?.message ?? "failed to open portal" }, { status: 500 });
    }
}
