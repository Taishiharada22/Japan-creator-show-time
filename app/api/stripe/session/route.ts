// app/api/stripe/session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSupabaseServerClient() {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createServerClient(url, key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => {
                    cookieStore.set(name, value, options);
                });
            },
        },
    });
}

export async function GET(req: Request) {
    try {
        const supabase = await getSupabaseServerClient();
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
        const user = authData.user;
        if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

        const url = new URL(req.url);
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) {
            return NextResponse.json({ error: "session_id is required" }, { status: 400 });
        }

        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // 自分のセッションだけ返す（client_reference_id or metadata で縛る）
        const metaUserId =
            (session.metadata?.user_id as string | undefined) ??
            (session.metadata?.supabase_user_id as string | undefined) ??
            null;

        const refUserId = session.client_reference_id ?? null;

        if (metaUserId !== user.id && refUserId !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        return NextResponse.json({
            session: {
                id: session.id,
                mode: session.mode,
                status: session.status,
                payment_status: session.payment_status,
                currency: session.currency,
                amount_total: session.amount_total,
            },
        });
    } catch (e: any) {
        console.error("GET /api/stripe/session error:", e);
        return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
    }
}
