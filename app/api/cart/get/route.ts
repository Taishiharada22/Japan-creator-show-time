import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromBearer } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asArray<T>(x: unknown): T[] {
    return Array.isArray(x) ? (x as T[]) : [];
}

export async function GET(req: Request) {
    try {
        const { user, error } = await getUserFromBearer(req);
        if (!user) return NextResponse.json({ error }, { status: 401 });

        // open cart を探す
        const { data: cart, error: cartErr } = await supabaseAdmin
            .from("carts")
            .select("id,status")
            .eq("user_id", user.id)
            .eq("status", "open")
            .maybeSingle();

        if (cartErr) throw cartErr;

        let cartId = cart?.id as string | undefined;

        // 無ければ作る
        if (!cartId) {
            const { data: created, error: insErr } = await supabaseAdmin
                .from("carts")
                .insert({ user_id: user.id, status: "open" })
                .select("id,status")
                .maybeSingle();

            if (insErr) throw insErr;
            cartId = created?.id;
        }

        if (!cartId) return NextResponse.json({ error: "failed to create cart" }, { status: 500 });

        // items
        const { data: items, error: itemsErr } = await supabaseAdmin
            .from("cart_items")
            .select(
                `
        id,
        product_id,
        qty,
        unit_price_minor,
        currency,
        products (
          id, slug, name, description, is_active
        )
      `
            )
            .eq("cart_id", cartId)
            .order("created_at", { ascending: true });

        if (itemsErr) throw itemsErr;

        const rows = asArray<any>(items).filter((r) => r.products?.is_active !== false);
        const amountTotalMinor = rows.reduce((sum, r) => sum + Number(r.unit_price_minor) * Number(r.qty), 0);
        const currency = rows[0]?.currency ?? "JPY";

        return NextResponse.json({
            cart: { id: cartId, status: "open" },
            items: rows,
            summary: { currency, amountTotalMinor },
        });
    } catch (e: any) {
        console.error("cart/get error:", e);
        return NextResponse.json({ error: e?.message ?? "cart/get failed" }, { status: 500 });
    }
}
