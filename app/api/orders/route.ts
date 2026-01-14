// app/api/orders/route.ts
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

async function getUserFromAccessToken(accessToken: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const sb = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data, error } = await sb.auth.getUser(accessToken);
    if (error) throw error;
    if (!data.user) throw new Error("Auth session missing!");
    return data.user;
}

export async function GET(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });

        const user = await getUserFromAccessToken(token);

        const { data, error } = await supabaseAdmin
            .from("shop_orders")
            .select("id,status,currency,amount_total_minor,created_at")
            .eq("user_id", user.id)
            .limit(200);

        if (error) throw error;

        const list = Array.isArray(data) ? data : [];
        list.sort((a: any, b: any) => {
            const ta = a?.created_at ? Date.parse(a.created_at) : 0;
            const tb = b?.created_at ? Date.parse(b.created_at) : 0;
            return tb - ta;
        });

        return NextResponse.json({ orders: list });
    } catch (e: any) {
        console.error("GET /api/orders error:", e);
        return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
    }
}
