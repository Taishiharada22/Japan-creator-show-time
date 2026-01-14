// app/api/cart/items/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSupabaseServerClient() {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createServerClient(url, key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => {
                    cookieStore.set(name, value, options);
                });
            },
        },
    });
}

async function getAuthedUserId() {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    if (!data.user) return null;
    return data.user.id;
}

type ProductSnapshot = {
    title: string;
    unit_amount: number; // minor unit (JPYなら円)
    currency: string;    // "jpy"
};

function pickFirstNumber(obj: any, keys: string[]): number | null {
    for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

function pickFirstString(obj: any, keys: string[]): string | null {
    for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === "string" && v.trim() !== "") return v;
    }
    return null;
}

async function fetchProductSnapshot(productId: string): Promise<ProductSnapshot> {
    // products のカラム名が環境で揺れる前提なので * で取って推測
    const { data, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Product not found");

    const title =
        pickFirstString(data, ["title", "name", "product_name"]) ?? "Item";

    const unit_amount =
        pickFirstNumber(data, [
            "unit_amount",
            "price_minor",
            "price",
            "amount_minor",
            "amount",
            "price_jpy",
            "priceJPY",
        ]) ?? null;

    if (unit_amount === null) {
        throw new Error("Product price not found (unit_amount/price_minor/price etc.)");
    }

    const currency =
        (pickFirstString(data, ["currency"]) ?? "jpy").toLowerCase();

    if (!Number.isInteger(unit_amount) || unit_amount < 0) {
        throw new Error("Invalid product price (must be integer minor unit)");
    }

    return { title, unit_amount, currency };
}

async function getActiveCartOrCreate(userId: string) {
    // active があればそれを使う
    const { data: cart, error: cartErr } = await supabaseAdmin
        .from("shop_carts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

    if (cartErr) throw cartErr;
    if (cart?.id) return cart;

    // なければ作る
    const { data: created, error: createErr } = await supabaseAdmin
        .from("shop_carts")
        .insert({ user_id: userId, status: "active", currency: "jpy" })
        .select("*")
        .single();

    if (createErr) throw createErr;
    return created;
}

async function getCartItems(cartId: string) {
    const { data, error } = await supabaseAdmin
        .from("shop_cart_items")
        .select("*")
        .eq("cart_id", cartId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

async function findExistingCartItem(cartId: string, productId: string) {
    const { data, error } = await supabaseAdmin
        .from("shop_cart_items")
        .select("*")
        .eq("cart_id", cartId)
        .eq("product_id", productId)
        .maybeSingle();

    if (error) throw error;
    return data ?? null;
}

function parseQuantity(q: any): number {
    const n = typeof q === "string" ? Number(q) : q;
    if (!Number.isFinite(n)) throw new Error("Invalid quantity");
    const i = Math.trunc(n);
    if (i === 0) return 0;
    return i;
}

type AddBody = {
    productId: string;
    quantity: number;
    op?: "add" | "set"; // add=加算 / set=上書き
};

export async function POST(req: Request) {
    try {
        const userId = await getAuthedUserId();
        if (!userId) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const body = (await req.json()) as AddBody;
        const productId = String(body.productId ?? "");
        const op = body.op ?? "add";
        const quantity = parseQuantity(body.quantity);

        if (!productId) {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }

        const cart = await getActiveCartOrCreate(userId);

        // 既存item
        const existing = await findExistingCartItem(cart.id, productId);

        let nextQty = quantity;
        if (op === "add") {
            const cur = Number(existing?.quantity ?? 0);
            nextQty = cur + quantity;
        }

        // 0以下なら削除
        if (nextQty <= 0) {
            await supabaseAdmin
                .from("shop_cart_items")
                .delete()
                .eq("cart_id", cart.id)
                .eq("product_id", productId);

            const items = await getCartItems(cart.id);
            return NextResponse.json({ cart, items });
        }

        // スナップショット（既存があればそれを維持、なければ products から取る）
        let snap: ProductSnapshot;
        if (existing) {
            snap = {
                title: String(existing.title ?? "Item"),
                unit_amount: Number(existing.unit_amount ?? 0),
                currency: String(existing.currency ?? cart.currency ?? "jpy").toLowerCase(),
            };
        } else {
            snap = await fetchProductSnapshot(productId);
        }

        // currency がカートと違うのはNG（混在防止）
        const cartCurrency = String(cart.currency ?? "jpy").toLowerCase();
        if (cartCurrency !== snap.currency) {
            return NextResponse.json(
                { error: `Currency mismatch. cart=${cartCurrency} product=${snap.currency}` },
                { status: 400 }
            );
        }

        // upsert（cart_id,product_id UNIQUE 前提）
        const { error: upErr } = await supabaseAdmin
            .from("shop_cart_items")
            .upsert(
                {
                    cart_id: cart.id,
                    product_id: productId,
                    quantity: nextQty,
                    unit_amount: snap.unit_amount,
                    currency: snap.currency,
                    title: snap.title,
                },
                { onConflict: "cart_id,product_id" }
            );

        if (upErr) throw upErr;

        const items = await getCartItems(cart.id);
        return NextResponse.json({ cart, items });
    } catch (e: any) {
        console.error("POST /api/cart/items error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Unknown error" },
            { status: 500 }
        );
    }
}

type PatchBody = {
    productId: string;
    quantity: number; // 0以下で削除
};

export async function PATCH(req: Request) {
    try {
        const userId = await getAuthedUserId();
        if (!userId) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const body = (await req.json()) as PatchBody;
        const productId = String(body.productId ?? "");
        const quantity = parseQuantity(body.quantity);

        if (!productId) {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }

        const cart = await getActiveCartOrCreate(userId);

        if (quantity <= 0) {
            await supabaseAdmin
                .from("shop_cart_items")
                .delete()
                .eq("cart_id", cart.id)
                .eq("product_id", productId);

            const items = await getCartItems(cart.id);
            return NextResponse.json({ cart, items });
        }

        const existing = await findExistingCartItem(cart.id, productId);
        if (!existing) {
            // 存在しないなら追加扱い（スナップショットは products から）
            const snap = await fetchProductSnapshot(productId);

            const cartCurrency = String(cart.currency ?? "jpy").toLowerCase();
            if (cartCurrency !== snap.currency) {
                return NextResponse.json(
                    { error: `Currency mismatch. cart=${cartCurrency} product=${snap.currency}` },
                    { status: 400 }
                );
            }

            const { error: insErr } = await supabaseAdmin
                .from("shop_cart_items")
                .insert({
                    cart_id: cart.id,
                    product_id: productId,
                    quantity,
                    unit_amount: snap.unit_amount,
                    currency: snap.currency,
                    title: snap.title,
                });

            if (insErr) throw insErr;

            const items = await getCartItems(cart.id);
            return NextResponse.json({ cart, items });
        }

        // 既存なら quantity だけ更新（スナップショット維持）
        const { error: updErr } = await supabaseAdmin
            .from("shop_cart_items")
            .update({ quantity })
            .eq("cart_id", cart.id)
            .eq("product_id", productId);

        if (updErr) throw updErr;

        const items = await getCartItems(cart.id);
        return NextResponse.json({ cart, items });
    } catch (e: any) {
        console.error("PATCH /api/cart/items error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Unknown error" },
            { status: 500 }
        );
    }
}

type DeleteBody = {
    productId: string;
};

export async function DELETE(req: Request) {
    try {
        const userId = await getAuthedUserId();
        if (!userId) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const body = (await req.json().catch(() => ({}))) as Partial<DeleteBody>;
        const productId = String(body.productId ?? "");

        if (!productId) {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }

        const cart = await getActiveCartOrCreate(userId);

        const { error: delErr } = await supabaseAdmin
            .from("shop_cart_items")
            .delete()
            .eq("cart_id", cart.id)
            .eq("product_id", productId);

        if (delErr) throw delErr;

        const items = await getCartItems(cart.id);
        return NextResponse.json({ cart, items });
    } catch (e: any) {
        console.error("DELETE /api/cart/items error:", e);
        return NextResponse.json(
            { error: e?.message ?? "Unknown error" },
            { status: 500 }
        );
    }
}
