"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type CartItem = {
    id: string;
    product_id: string;
    quantity: number;
    unit_price_minor: number;
    currency: string;
    products: {
        id: string;
        name: string;
        slug: string | null;
        currency: string | null;
        price_minor: number | null;
        price_jpy: number | null;
    } | null;
};

type CartResponse = {
    cartId: string;
    status: string;
    items: CartItem[];
};

function money(currency: string, minor: number) {
    const cur = (currency ?? "JPY").toUpperCase();
    if (cur === "JPY") return `¥${Number(minor).toLocaleString()}`;
    if (cur === "USD") return `$${(Number(minor) / 100).toFixed(2)}`;
    return `${cur} ${Number(minor)}`;
}

async function getAccessTokenOrThrow() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("not logged in");
    return token;
}

export default function CartPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [cart, setCart] = useState<CartResponse | null>(null);

    const load = async () => {
        setLoading(true);
        setErr(null);

        try {
            const token = await getAccessTokenOrThrow();
            const res = await fetch("/api/cart", {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });
            const json = (await res.json().catch(() => ({}))) as any;
            if (!res.ok) throw new Error(json?.error || `failed (${res.status})`);
            setCart(json as CartResponse);
        } catch (e: any) {
            console.error("cart load error:", e);
            setErr(e?.message ?? "failed to load cart");
            setCart(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const subtotal = useMemo(() => {
        const items = cart?.items ?? [];
        return items.reduce((sum, it) => sum + (it.unit_price_minor ?? 0) * (it.quantity ?? 0), 0);
    }, [cart]);

    const currency = useMemo(() => {
        const items = cart?.items ?? [];
        return (items[0]?.currency ?? "JPY").toUpperCase();
    }, [cart]);

    const mutateItem = async (op: "setQty" | "remove" | "clear", payload: any) => {
        if (saving) return;
        setSaving(true);
        setErr(null);

        try {
            const token = await getAccessTokenOrThrow();
            const res = await fetch("/api/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ op, ...payload }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || `failed (${res.status})`);
            await load();
        } catch (e: any) {
            console.error("cart mutate error:", e);
            setErr(e?.message ?? "failed");
        } finally {
            setSaving(false);
        }
    };

    const startCheckout = async () => {
        if (saving) return;
        setSaving(true);
        setErr(null);

        try {
            const token = await getAccessTokenOrThrow();

            // ✅ ここを /api/checkout に統一（= envの sk_test を確実に使う）
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ returnPath: "/cart" }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.url) throw new Error(json?.error || `failed (${res.status})`);
            window.location.href = String(json.url);
        } catch (e: any) {
            console.error("startCheckout error:", e);
            console.log("checkout endpoint: /api/checkout");

            setErr(e?.message ?? "failed to start checkout");
            setSaving(false);
        }
    };

    return (
        <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-extrabold tracking-tight">Cart</h1>
                    <p className="text-sm text-gray-600">mode: payment のCheckoutで購入</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void load()}
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                    >
                        Reload
                    </button>
                    <Link href="/products" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500">
                        Products
                    </Link>
                    <Link href="/orders" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500">
                        Orders
                    </Link>
                </div>
            </header>

            {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

            {loading ? (
                <p className="text-sm text-gray-600">読み込み中...</p>
            ) : !cart || cart.items.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700">カートは空です</div>
            ) : (
                <div className="rounded-2xl border bg-white p-6 space-y-5">
                    <div className="space-y-4">
                        {cart.items.map((it) => (
                            <div key={it.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                                <div className="min-w-0">
                                    <div className="font-bold">{it.products?.name ?? "Unknown product"}</div>
                                    <div className="text-sm text-gray-600">
                                        {money(it.currency, it.unit_price_minor)} × {it.quantity}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={saving}
                                        onClick={() => mutateItem("setQty", { itemId: it.id, quantity: Math.max(1, it.quantity - 1) })}
                                        className="rounded-xl border bg-white px-3 py-2 text-sm font-bold disabled:opacity-60"
                                    >
                                        −
                                    </button>
                                    <span className="w-10 text-center text-sm font-bold">{it.quantity}</span>
                                    <button
                                        disabled={saving}
                                        onClick={() => mutateItem("setQty", { itemId: it.id, quantity: it.quantity + 1 })}
                                        className="rounded-xl border bg-white px-3 py-2 text-sm font-bold disabled:opacity-60"
                                    >
                                        +
                                    </button>
                                    <button
                                        disabled={saving}
                                        onClick={() => mutateItem("remove", { itemId: it.id })}
                                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                            disabled={saving}
                            onClick={() => mutateItem("clear", {})}
                            className="rounded-xl border bg-white px-4 py-2 text-sm font-bold disabled:opacity-60"
                        >
                            Clear cart
                        </button>

                        <div className="text-right">
                            <div className="text-sm text-gray-600">Subtotal</div>
                            <div className="text-2xl font-extrabold">{money(currency, subtotal)}</div>
                        </div>
                    </div>

                    <button
                        disabled={saving}
                        onClick={startCheckout}
                        className="w-full rounded-xl bg-black px-4 py-3 text-sm font-extrabold text-white hover:opacity-90 disabled:opacity-60"
                    >
                        {saving ? "Processing..." : "Checkout"}
                    </button>

                    <div className="text-xs text-gray-500">※ webhook（checkout.session.completed）で注文確定＆DB反映します</div>
                </div>
            )}
        </main>
    );
}
