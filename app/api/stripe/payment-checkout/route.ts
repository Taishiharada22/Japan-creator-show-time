import { NextResponse } from "next/server";
import type Stripe from "stripe";
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

async function getOrCreateStripeCustomerId(userId: string, email?: string | null) {
    const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();
    if (profErr) throw profErr;

    let customerId = (prof?.stripe_customer_id as string | null) ?? null;

    if (!customerId) {
        const stripe = getStripe();
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

        const auth = await getUserFromBearer(req);
        if (auth.error) return NextResponse.json({ error: auth.error }, { status: 401 });
        const user = auth.user;

        const { returnPath } = (await req.json().catch(() => ({}))) as { returnPath?: string };

        // open cart
        const { data: cart, error: cartErr } = await supabaseAdmin
            .from("shop_carts")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "open")
            .maybeSingle();
        if (cartErr) throw cartErr;
        if (!cart?.id) return NextResponse.json({ error: "cart is empty" }, { status: 400 });

        const { data: items, error: itemsErr } = await supabaseAdmin
            .from("shop_cart_items")
            .select(
                `
        id, product_id, quantity, unit_price_minor, currency,
        products ( id, name, slug )
      `
            )
            .eq("cart_id", cart.id);
        if (itemsErr) throw itemsErr;

        const list = (items ?? []) as any[];
        if (list.length === 0) return NextResponse.json({ error: "cart is empty" }, { status: 400 });

        // Stripe Checkout は「同一通貨」前提で運用（混ざると事故る）
        const cur = String(list[0]?.currency ?? "JPY").toLowerCase();
        const mixed = list.some((x) => String(x.currency ?? "JPY").toLowerCase() !== cur);
        if (mixed) {
            return NextResponse.json({ error: "mixed currency cart is not supported" }, { status: 400 });
        }

        const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = list.map((it) => {
            const name = it.products?.name ?? "Product";
            const unit = Number(it.unit_price_minor ?? 0);

            return {
                quantity: Number(it.quantity ?? 1),
                price_data: {
                    currency: cur,
                    unit_amount: unit,
                    product_data: {
                        name,
                        metadata: {
                            supabase_product_id: String(it.product_id),
                        },
                    },
                },
            };
        });

        const origin = getOrigin(req);
        const back = `${origin}${returnPath && returnPath.startsWith("/") ? returnPath : "/cart"}`;

        const customerId = await getOrCreateStripeCustomerId(user.id, user.email);

        // ✅ mode: payment
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer: customerId,
            line_items,
            success_url: `${back}?success=1`,
            cancel_url: `${back}?canceled=1`,
            metadata: {
                supabase_user_id: user.id,
                cart_id: cart.id,
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (e: any) {
        console.error("payment-checkout error:", e);
        return NextResponse.json({ error: e?.message ?? "checkout failed" }, { status: 500 });
    }
}
