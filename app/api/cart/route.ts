// app/api/cart/route.ts
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

async function getOrCreateActiveCart(userId: string) {
    const existing = await fetchActiveCart(userId);
    if (existing?.id) return existing;

    const { data: created, error: insErr } = await supabaseAdmin
        .from("shop_carts")
        .insert({ user_id: userId, status: "active" })
        .select("id,status")
        .single();

    if (insErr) {
        const code = String((insErr as any)?.code ?? "");
        const msg = String((insErr as any)?.message ?? "");
        const isDup =
            code === "23505" ||
            msg.includes("shop_carts_one_active_per_user") ||
            msg.includes("duplicate key");

        if (isDup) {
            const again = await fetchActiveCart(userId);
            if (again?.id) return again;
        }
        throw insErr;
    }

    return created;
}

type ProductRow = {
    id: string;
    name: string | null;
    slug: string | null;
    currency: string | null;
    price_minor: number | null;
    price_jpy: number | null;
    status?: string | null;
};

function currencyUpper(v: unknown) {
    return String(v ?? "JPY").toUpperCase();
}

function isPurchasableProductStatus(status: unknown): boolean {
    const s = String(status ?? "").toLowerCase().trim();
    if (!s) return true;
    return s === "public" || s === "active" || s === "published";
}

/**
 * ✅ JPY運用救済込みの unit_amount(=minor) 決定
 * - 基本: price_minor
 * - JPY: price_minor が無ければ price_jpy を使う
 * - currency が NULL でも price_jpy があるなら JPY 扱い
 */
function unitAmountMinorFromProduct(p: ProductRow): number {
    const curU = currencyUpper(p.currency ?? (p.price_jpy != null ? "JPY" : "JPY"));

    let raw: number | null = p.price_minor ?? null;

    if ((raw == null || Number(raw) <= 0) && curU === "JPY") {
        const pj = p.price_jpy ?? null;
        if (pj != null) raw = pj;
    }

    if ((raw == null || Number(raw) <= 0) && !p.currency && p.price_jpy != null) {
        raw = p.price_jpy;
    }

    const n = Number(raw ?? 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
}

export async function GET(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });

        const user = await getUserFromAccessToken(token);
        const cart = await getOrCreateActiveCart(user.id);

        const { data, error } = await supabaseAdmin
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
          slug,
          currency,
          price_minor,
          price_jpy,
          status
        )
      `
            )
            .eq("cart_id", cart.id)
            .order("created_at", { ascending: true });

        if (error) throw error;

        return NextResponse.json({
            cartId: cart.id,
            status: cart.status,
            items: Array.isArray(data) ? data : [],
        });
    } catch (e: any) {
        console.error("GET /api/cart error:", e);
        return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });

        const user = await getUserFromAccessToken(token);
        const cart = await getOrCreateActiveCart(user.id);

        const body = (await req.json().catch(() => ({}))) as any;
        const op = String(body?.op ?? "");

        // ===== add =====
        if (op === "add") {
            const productId = String(body?.productId ?? "").trim();
            const quantity = Math.min(99, Math.max(1, Number(body?.quantity ?? 1)));

            if (!productId) return NextResponse.json({ error: "missing productId" }, { status: 400 });

            const { data: prod, error: pErr } = await supabaseAdmin
                .from("products")
                .select("id,name,slug,currency,price_minor,price_jpy,status")
                .eq("id", productId)
                .maybeSingle();

            if (pErr) throw pErr;
            const p = (prod as ProductRow | null) ?? null;

            if (!p?.id) return NextResponse.json({ error: "product not found" }, { status: 404 });
            if (!isPurchasableProductStatus(p.status))
                return NextResponse.json({ error: "product is not available" }, { status: 400 });

            const unit = unitAmountMinorFromProduct(p);
            if (unit <= 0) return NextResponse.json({ error: "invalid product price" }, { status: 400 });

            const curU = currencyUpper(p.currency ?? (p.price_jpy != null ? "JPY" : "JPY"));

            // 既存なら加算、無ければinsert
            const { data: existing, error: exErr } = await supabaseAdmin
                .from("shop_cart_items")
                .select("id,quantity")
                .eq("cart_id", cart.id)
                .eq("product_id", productId)
                .maybeSingle();
            if (exErr) throw exErr;

            if (existing?.id) {
                const nextQty = Math.min(99, Math.max(1, Number(existing.quantity ?? 0) + quantity));
                const { error: upErr } = await supabaseAdmin
                    .from("shop_cart_items")
                    .update({ quantity: nextQty, unit_price_minor: unit, currency: curU })
                    .eq("id", existing.id)
                    .eq("cart_id", cart.id);
                if (upErr) throw upErr;
            } else {
                const { error: insErr } = await supabaseAdmin.from("shop_cart_items").insert({
                    cart_id: cart.id,
                    product_id: productId,
                    quantity,
                    unit_price_minor: unit,
                    currency: curU,
                });
                if (insErr) throw insErr;
            }

            return NextResponse.json({ ok: true });
        }

        // ===== setQty =====
        if (op === "setQty") {
            const itemId = String(body?.itemId ?? "").trim();
            const quantity = Math.min(99, Math.max(1, Number(body?.quantity ?? 1)));
            if (!itemId) return NextResponse.json({ error: "missing itemId" }, { status: 400 });

            const { error } = await supabaseAdmin
                .from("shop_cart_items")
                .update({ quantity })
                .eq("id", itemId)
                .eq("cart_id", cart.id);

            if (error) throw error;
            return NextResponse.json({ ok: true });
        }

        // ===== remove =====
        if (op === "remove") {
            const itemId = String(body?.itemId ?? "").trim();
            if (!itemId) return NextResponse.json({ error: "missing itemId" }, { status: 400 });

            const { error } = await supabaseAdmin
                .from("shop_cart_items")
                .delete()
                .eq("id", itemId)
                .eq("cart_id", cart.id);

            if (error) throw error;
            return NextResponse.json({ ok: true });
        }

        // ===== clear =====
        if (op === "clear") {
            const { error } = await supabaseAdmin.from("shop_cart_items").delete().eq("cart_id", cart.id);
            if (error) throw error;
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "unknown op" }, { status: 400 });
    } catch (e: any) {
        console.error("POST /api/cart error:", e);
        return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
    }
}
