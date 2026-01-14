// app/api/orders/by-session/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
    const v = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!v) return null;
    const m = v.match(/^Bearer\s+(.+)$/i);
    return m?.[1] ?? null;
}

async function getUserIdFromAccessToken(accessToken: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const sb = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await sb.auth.getUser(accessToken);
    if (error) throw error;
    return data.user?.id ?? null;
}

export async function GET(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) return NextResponse.json({ error: "missing Authorization Bearer token" }, { status: 401 });

        const userId = await getUserIdFromAccessToken(token);
        if (!userId) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

        const url = new URL(req.url);
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) return NextResponse.json({ error: "missing session_id" }, { status: 400 });

        const { data: order, error } = await supabaseAdmin
            .from("shop_orders")
            .select("id,status,created_at,stripe_checkout_session_id")
            .eq("user_id", userId)
            .eq("stripe_checkout_session_id", sessionId)
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json({ order: order ?? null });
    } catch (e: any) {
        console.error("GET /api/orders/by-session error:", e);
        return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
    }
}
