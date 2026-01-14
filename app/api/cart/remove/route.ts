import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromBearer } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const { user, error } = await getUserFromBearer(req);
        if (!user) return NextResponse.json({ error }, { status: 401 });

        const body = (await req.json().catch(() => ({}))) as { productId?: string };
        const productId = body.productId;

        if (!productId) return NextResponse.json({ error: "missing productId" }, { status: 400 });

        const { data: cart, error: cartErr } = await supabaseAdmin
            .from("carts")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "open")
            .maybeSingle();

        if (cartErr) throw cartErr;
        if (!cart?.id) return NextResponse.json({ error: "cart not found" }, { status: 404 });

        const { error: delErr } = await supabaseAdmin
            .from("cart_items")
            .delete()
            .eq("cart_id", cart.id)
            .eq("product_id", productId);

        if (delErr) throw delErr;

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error("cart/remove error:", e);
        return NextResponse.json({ error: e?.message ?? "cart/remove failed" }, { status: 500 });
    }
}
