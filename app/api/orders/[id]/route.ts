// app/api/orders/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
    const v = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!v) return null;
    const m = v.match(/^Bearer\s+(.+)$/i);
    return m?.[1] ?? null;
}

// Next.js 16 対策: ctx.params が Promise の場合がある
async function resolveParams(ctx: any): Promise<any> {
    const p = ctx?.params;
    if (p && typeof p === "object" && typeof (p as any).then === "function") return await p;
    return p;
}

function isUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request, ctx: any) {
    try {
        const token = getBearerToken(req);
        if (!token) return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });

        // ✅ createClient(anon)不要：service role clientで access token を検証できる
        const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(token);
        if (uErr || !u?.user) {
            return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });
        }
        const user = u.user;

        const params = await resolveParams(ctx);
        const orderId = String(params?.id ?? "").trim();
        if (!orderId) return NextResponse.json({ error: "missing id" }, { status: 400 });
        if (!isUuid(orderId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

        // order（必ず user_id で絞る）
        const { data: order, error: oErr } = await supabaseAdmin
            .from("shop_orders")
            .select("id,user_id,status,currency,amount_subtotal_minor,amount_total_minor,created_at")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .maybeSingle();

        if (oErr) throw oErr;
        if (!order?.id) return NextResponse.json({ error: "not found" }, { status: 404 });

        // items（shop_order_items に created_at が無い環境があるので order は id で）
        const { data: items, error: iErr } = await supabaseAdmin
            .from("shop_order_items")
            .select(
                `
        id,
        order_id,
        product_id,
        quantity,
        unit_price_minor,
        currency,
        products:products (
          id,
          name,
          slug
        )
      `
            )
            .eq("order_id", orderId)
            .order("id", { ascending: true });

        if (iErr) throw iErr;

        const list = (items ?? []) as any[];

        const items_total_minor = list.reduce((sum, it) => {
            const q = Number(it?.quantity ?? 0);
            const u = Number(it?.unit_price_minor ?? 0);
            return sum + q * u;
        }, 0);

        return NextResponse.json({
            order,
            items: list,
            totals: {
                items_total_minor,
                // DBの total が無い時のフォールバックに使える
                computed_total_minor: items_total_minor,
            },
        });
    } catch (e: any) {
        console.error("GET /api/orders/[id] error:", e);
        return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
    }
}
