import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromBearer } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const { user, error } = await getUserFromBearer(req);
        if (!user) return NextResponse.json({ error }, { status: 401 });

        const body = (await req.json().catch(() => ({}))) as { productId?: string; qty?: number };
        const productId = body.productId;
        const qty = Number(body.qty);

        if (!productId) return NextResponse.json({ error: "missing productId" }, { status: 400 });
        if (!Number.isFinite(qty)) return NextResponse.json({ error: "invalid qty" }, { status: 400 });

        const { data: cart, error: cartErr } = await supabaseAdmin
            .from("carts")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "open")
            .maybeSingle();

        if (cartErr) throw cartErr;
        if (!cart?.id) return NextResponse.json({ error: "cart not found" }, { status: 404 });

        const nowIso = new Date().toISOString();

        if (qty <= 0) {
            const { error: delErr } = await supabaseAdmin
                .from("cart_items")
                .delete()
                .eq("cart_id", cart.id)
                .eq("product_id", productId);
            if (delErr) throw delErr;

            return NextResponse.json({ ok: true });
        }

        const { error: upErr } = await supabaseAdmin
            .from("cart_items")
            .update({ qty, updated_at: nowIso })
            .eq("cart_id", cart.id)
            .eq("product_id", productId);

        if (upErr) throw upErr;

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error("cart/update error:", e);
        return NextResponse.json({ error: e?.message ?? "cart/update failed" }, { status: 500 });
    }
}
