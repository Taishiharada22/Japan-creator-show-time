// app/api/dev/force-order/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

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

async function fetchActiveCart(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("shop_carts")
        .select("id,status")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .maybeSingle();
    if (error) throw error;
    return data ?? null;
}

type CartItemRow = {
    id: string;
    product_id: string;
    quantity: number;
    unit_price_minor: number | null;
    currency: string | null;
    products: {
        id: string;
        name: string | null;
        currency: string | null;
        price_minor: number | null;
        price_jpy: number | null;
        status?: string | null;
    } | null;
};

function currencyUpper(v: unknown) {
    return String(v ?? "JPY").toUpperCase();
}

function isPurchasableProductStatus(status: unknown): boolean {
    const s = String(status ?? "").toLowerCase().trim();
    if (!s) return true;
    return s === "public" || s === "active" || s === "published";
}

function unitFromItem(it: CartItemRow): number {
    const p = it.products;
    if (!p) return 0;

    const curU = currencyUpper(p.currency ?? it.currency ?? (p.price_jpy != null ? "JPY" : "JPY"));

    let raw: number | null = p.price_minor ?? it.unit_price_minor ?? null;

    if ((raw == null || Number(raw) <= 0) && curU === "JPY") {
        if (p.price_jpy != null) raw = p.price_jpy;
    }
    if ((raw == null || Number(raw) <= 0) && !p.currency && p.price_jpy != null) {
        raw = p.price_jpy;
    }

    const n = Number(raw ?? 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
}

export async function POST(req: Request) {
    try {
        // ✅ 本番では動かさない
        if (process.env.NODE_ENV !== "development") {
            return NextResponse.json({ error: "dev-only endpoint" }, { status: 403 });
        }

        const token = getBearerToken(req);
        if (!token) return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });

        const user = await getUserFromAccessToken(token);

        const cart = await fetchActiveCart(user.id);
        if (!cart?.id) return NextResponse.json({ error: "cart not found" }, { status: 404 });

        const { data: rawItems, error: itemsErr } = await supabaseAdmin
            .from("shop_cart_items")
            .select(
                `
        id,
        product_id,
        quantity,
        unit_price_minor,
        currency,
        products:products (
          id,
          name,
          currency,
          price_minor,
          price_jpy,
          status
        )
      `
            )
            .eq("cart_id", cart.id)
            .order("created_at", { ascending: true });

        if (itemsErr) throw itemsErr;

        const items: CartItemRow[] = Array.isArray(rawItems) ? (rawItems as any) : [];

        const valid = items.filter((it) => {
            if (!it.products?.id) return false;
            if (!isPurchasableProductStatus(it.products?.status)) return false;
            const q = Number(it.quantity ?? 0);
            if (!Number.isFinite(q) || q <= 0) return false;
            const unit = unitFromItem(it);
            if (unit <= 0) return false;
            return true;
        });

        if (valid.length === 0) {
            return NextResponse.json({ error: "cart is empty (or contains only unavailable items)" }, { status: 400 });
        }

        const currency = currencyUpper(valid[0]?.products?.currency ?? valid[0]?.currency ?? "JPY");
        const mixed = valid.some((it) => currencyUpper(it.products?.currency ?? it.currency ?? currency) !== currency);
        if (mixed) return NextResponse.json({ error: "mixed currency in cart is not supported" }, { status: 400 });

        const devSessionId = `dev_cart_${cart.id}`;

        // idempotent（同cartの擬似注文があればそれ返す）
        const { data: exists, error: exErr } = await supabaseAdmin
            .from("shop_orders")
            .select("id")
            .eq("stripe_checkout_session_id", devSessionId)
            .maybeSingle();
        if (exErr) throw exErr;
        if (exists?.id) return NextResponse.json({ orderId: exists.id });

        const subtotal = valid.reduce((sum, it) => sum + unitFromItem(it) * Number(it.quantity ?? 0), 0);
        const total = subtotal; // 税/送料を後で入れるならここで加算

        const { data: order, error: ordErr } = await supabaseAdmin
            .from("shop_orders")
            .insert({
                user_id: user.id,
                status: "paid",
                currency,
                amount_subtotal_minor: subtotal,
                amount_total_minor: total,
                stripe_checkout_session_id: devSessionId,
                stripe_payment_intent_id: `dev_pi_${randomUUID()}`,
            })
            .select("id")
            .single();
        if (ordErr) throw ordErr;

        const orderId = String(order.id);

        const rows = valid.map((it) => ({
            order_id: orderId,
            product_id: it.product_id,
            quantity: Number(it.quantity ?? 1),
            unit_price_minor: unitFromItem(it),
            currency,
        }));

        const { error: insErr } = await supabaseAdmin.from("shop_order_items").insert(rows);
        if (insErr) throw insErr;

        // cart cleanup
        await supabaseAdmin.from("shop_cart_items").delete().eq("cart_id", cart.id);
        await supabaseAdmin.from("shop_carts").update({ status: "ordered" }).eq("id", cart.id);

        return NextResponse.json({ orderId });
    } catch (e: any) {
        console.error("POST /api/dev/force-order error:", e);
        return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
    }
}
