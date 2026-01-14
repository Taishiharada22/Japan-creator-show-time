// app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(req: Request) {
    const h = req.headers;
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${proto}://${host}`;
    return new URL(req.url).origin;
}

function bearerToken(req: Request): string | null {
    const a = req.headers.get("authorization") ?? "";
    if (!a.toLowerCase().startsWith("bearer ")) return null;
    return a.slice(7).trim() || null;
}

function stripeIsNoSuchCustomerError(e: any) {
    const msg = String(e?.message ?? "");
    const code = String(e?.code ?? "");
    return code === "resource_missing" || msg.includes("No such customer");
}

type CartItemRow = {
    id: string;
    cart_id: string;
    product_id: string;
    quantity: number;
    unit_price_minor: number | null;
    currency: string | null;
    products: {
        id: string;
        name: string;
        currency: string | null;
        price_minor: number | null;
        price_jpy: number | null;
    } | null;
};

function unitAmountMinorFromItem(it: CartItemRow): { unit: number; currency: string } | null {
    const p = it.products;
    const currency = String(it.currency ?? p?.currency ?? "JPY").toUpperCase();

    // unit price は cart_items の unit_price_minor 優先
    let unit = Number(it.unit_price_minor ?? 0);

    // 無ければ products 側から拾う
    if (!unit || unit <= 0) {
        const cand =
            currency === "JPY"
                ? Number(p?.price_jpy ?? p?.price_minor ?? 0)
                : Number(p?.price_minor ?? 0);
        unit = cand;
    }

    if (!unit || unit <= 0) return null;

    // Stripe は 3-letter lower case
    const stripeCurrency = currency.toLowerCase();
    return { unit, currency: stripeCurrency };
}

async function getOrCreateCustomerId(userId: string, email?: string | null) {
    const stripe = getStripe();

    const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

    if (profErr) throw profErr;

    let customerId = (prof?.stripe_customer_id as string | null) ?? null;

    // テスト/本番キー切替時の「stored customerが違うモード」対策
    if (customerId) {
        try {
            await stripe.customers.retrieve(customerId);
        } catch (e: any) {
            if (stripeIsNoSuchCustomerError(e)) {
                console.warn("[checkout] stored customer not found in this mode. ignoring:", customerId);
                customerId = null;
            } else {
                throw e;
            }
        }
    }

    if (!customerId) {
        const customer = await stripe.customers.create({
            email: email ?? undefined,
            metadata: { supabase_user_id: userId },
        });

        customerId = customer.id;

        const { error: upErr } = await supabaseAdmin
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .eq("id", userId);

        if (upErr) throw upErr;
    }

    return customerId;
}

export async function POST(req: Request) {
    try {
        const stripe = getStripe();
        const origin = getOrigin(req);

        // auth
        const token = bearerToken(req);
        if (!token) return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });

        const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(token);
        if (uErr || !u?.user) {
            return NextResponse.json({ error: "Auth session missing!" }, { status: 401 });
        }

        const userId = u.user.id;
        const email = u.user.email ?? null;

        const body = (await req.json().catch(() => ({}))) as any;
        const returnPath = String(body?.returnPath ?? "/cart");

        // active cart を最新1件で取る
        const { data: carts, error: cartErr } = await supabaseAdmin
            .from("shop_carts")
            .select("id,status,created_at")
            .eq("user_id", userId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1);

        if (cartErr) throw cartErr;

        const cartId = carts?.[0]?.id as string | undefined;
        if (!cartId) {
            return NextResponse.json({ error: "cart is empty" }, { status: 400 });
        }

        // cart items + products
        const { data: itemsData, error: itemErr } = await supabaseAdmin
            .from("shop_cart_items")
            .select(
                `
        id,
        cart_id,
        product_id,
        quantity,
        unit_price_minor,
        currency,
        products:products (
          id,
          name,
          currency,
          price_minor,
          price_jpy
        )
      `
            )
            .eq("cart_id", cartId);

        if (itemErr) throw itemErr;

        // ✅ ここが修正ポイント：TSの “変換が危険” エラー回避
        const list = ((itemsData ?? []) as unknown) as CartItemRow[];

        const line_items = list
            .map((it) => {
                const qty = Math.max(1, Number(it.quantity ?? 1));
                const name = it.products?.name ?? "Product";
                const pricing = unitAmountMinorFromItem(it);
                if (!pricing) return null;

                return {
                    price_data: {
                        currency: pricing.currency,
                        unit_amount: pricing.unit,
                        product_data: {
                            name,
                            metadata: {
                                // webhook 側で DB product_id を復元する
                                supabase_product_id: it.product_id,
                            },
                        },
                    },
                    quantity: qty,
                };
            })
            .filter(Boolean) as any[];

        if (line_items.length === 0) {
            return NextResponse.json(
                { error: "cart is empty (or contains only unavailable items)" },
                { status: 400 }
            );
        }

        const customerId = await getOrCreateCustomerId(userId, email);

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer: customerId,
            line_items,
            success_url: `${origin}/orders?success=1`,
            cancel_url: `${origin}${returnPath}`,
            metadata: {
                supabase_user_id: userId,
                cart_id: cartId,
            },
        });

        if (!session?.url) {
            return NextResponse.json({ error: "stripe session url missing" }, { status: 500 });
        }

        return NextResponse.json({ url: session.url });
    } catch (e: any) {
        console.error("[checkout] error:", e);
        return NextResponse.json({ error: e?.message ?? "checkout failed" }, { status: 500 });
    }
}
