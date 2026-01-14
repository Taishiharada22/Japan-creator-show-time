import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromBearer } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(req: Request) {
    const h = req.headers;
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${proto}://${host}`;
    return new URL(req.url).origin;
}

function safeReturnPath(p?: string) {
    if (!p) return "/cart";
    return p.startsWith("/") ? p : "/cart";
}

function withStripeReturn(urlStr: string) {
    const u = new URL(urlStr);
    u.searchParams.set("stripe", "1");
    return u.toString();
}

export async function POST(req: Request) {
    try {
        const stripe = getStripe();

        const { user, error } = await getUserFromBearer(req);
        if (!user) return NextResponse.json({ error }, { status: 401 });

        const { returnPath } = (await req.json().catch(() => ({}))) as { returnPath?: string };

        // open cart
        const { data: cart, error: cartErr } = await supabaseAdmin
            .from("carts")
            .select("id,status")
            .eq("user_id", user.id)
            .eq("status", "open")
            .maybeSingle();

        if (cartErr) throw cartErr;
        if (!cart?.id) return NextResponse.json({ error: "cart is empty" }, { status: 400 });

        // items（商品名/説明も取る）
        const { data: items, error: itemsErr } = await supabaseAdmin
            .from("cart_items")
            .select(
                `
        product_id, qty, unit_price_minor, currency,
        products ( name, description, is_active )
      `
            )
            .eq("cart_id", cart.id);

        if (itemsErr) throw itemsErr;

        const rows = (items ?? []) as any[];
        const valid = rows.filter((r) => r.qty > 0 && r.products?.is_active === true);

        if (valid.length === 0) {
            return NextResponse.json({ error: "cart has no purchasable items" }, { status: 400 });
        }

        // currency はカート内統一（混在は弾く）
        const currency = String(valid[0].currency ?? "JPY").toUpperCase();
        const mixed = valid.some((r) => String(r.currency ?? "").toUpperCase() !== currency);
        if (mixed) return NextResponse.json({ error: "mixed currency cart is not supported" }, { status: 400 });

        // order を pending で作り、ここで注文明細を確定スナップショット化（重要）
        const nowIso = new Date().toISOString();

        const amountTotalMinor = valid.reduce(
            (sum, r) => sum + Number(r.unit_price_minor) * Number(r.qty),
            0
        );

        const { data: order, error: orderErr } = await supabaseAdmin
            .from("orders")
            .insert({
                user_id: user.id,
                cart_id: cart.id,
                status: "pending",
                currency,
                amount_total_minor: amountTotalMinor,
                updated_at: nowIso,
            })
            .select("id")
            .maybeSingle();

        if (orderErr) throw orderErr;
        if (!order?.id) return NextResponse.json({ error: "failed to create order" }, { status: 500 });

        const orderItems = valid.map((r) => ({
            order_id: order.id,
            product_id: r.product_id,
            qty: r.qty,
            unit_price_minor: r.unit_price_minor,
            line_total_minor: Number(r.unit_price_minor) * Number(r.qty),
        }));

        const { error: oiErr } = await supabaseAdmin.from("order_items").insert(orderItems);
        if (oiErr) throw oiErr;

        // Stripe line_items（price_data）
        const line_items = valid.map((r) => ({
            quantity: r.qty,
            price_data: {
                currency: currency.toLowerCase(),
                unit_amount: Number(r.unit_price_minor),
                product_data: {
                    name: String(r.products?.name ?? "Item"),
                    description: r.products?.description ?? undefined,
                },
            },
        }));

        const origin = getOrigin(req);
        const backBase = `${origin}${safeReturnPath(returnPath)}`;
        const back = withStripeReturn(backBase);

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items,
            success_url: back,
            cancel_url: back,

            metadata: {
                supabase_user_id: user.id,
                cart_id: cart.id,
                order_id: order.id,
            },
        });

        const { error: upErr } = await supabaseAdmin
            .from("orders")
            .update({ stripe_checkout_session_id: session.id, updated_at: nowIso })
            .eq("id", order.id);

        if (upErr) throw upErr;

        return NextResponse.json({ url: session.url });
    } catch (e: any) {
        console.error("checkout-payment error:", e);
        return NextResponse.json({ error: e?.message ?? "checkout-payment failed" }, { status: 500 });
    }
}
