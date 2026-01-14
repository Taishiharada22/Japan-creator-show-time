import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromBearer } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { user, error } = await getUserFromBearer(req);
        if (!user) return NextResponse.json({ error }, { status: 401 });

        const { data: order, error: ordErr } = await supabaseAdmin
            .from("orders")
            .select(
                `
        id, status, currency, amount_total_minor, created_at,
        order_items (
          id, product_id, qty, unit_price_minor, line_total_minor,
          products ( id, name, slug )
        )
      `
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (ordErr) throw ordErr;

        return NextResponse.json({ order: order ?? null });
    } catch (e: any) {
        console.error("orders/latest error:", e);
        return NextResponse.json({ error: e?.message ?? "orders/latest failed" }, { status: 500 });
    }
}
