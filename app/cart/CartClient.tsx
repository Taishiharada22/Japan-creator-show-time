// app/cart/CartClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CartItem, CartResponse } from "@/lib/cartClient";
import {
    getCart,
    clearCart,
    setCartItemQty,
    removeFromCart,
    startCheckout,
} from "@/lib/cartClient";

function formatJPY(n: number) {
    return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(n);
}

export default function CartClient() {
    const [data, setData] = useState<CartResponse>({ cart: null, items: [] });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null); // productId or "checkout"
    const [error, setError] = useState<string | null>(null);

    const total = useMemo(() => {
        return data.items.reduce((sum, it) => sum + it.unit_amount * it.quantity, 0);
    }, [data.items]);

    async function refresh() {
        setError(null);
        setLoading(true);
        try {
            const res = await getCart();
            setData(res);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load cart");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function inc(it: CartItem) {
        setError(null);
        setBusy(it.product_id);
        try {
            const res = await setCartItemQty({ productId: it.product_id, quantity: it.quantity + 1 });
            setData(res);
        } catch (e: any) {
            setError(e?.message ?? "Failed");
        } finally {
            setBusy(null);
        }
    }

    async function dec(it: CartItem) {
        setError(null);
        setBusy(it.product_id);
        try {
            const res = await setCartItemQty({ productId: it.product_id, quantity: it.quantity - 1 });
            setData(res);
        } catch (e: any) {
            setError(e?.message ?? "Failed");
        } finally {
            setBusy(null);
        }
    }

    async function remove(it: CartItem) {
        setError(null);
        setBusy(it.product_id);
        try {
            const res = await removeFromCart(it.product_id);
            setData(res);
        } catch (e: any) {
            setError(e?.message ?? "Failed");
        } finally {
            setBusy(null);
        }
    }

    async function clear() {
        setError(null);
        setBusy("clear");
        try {
            const res = await clearCart();
            setData(res);
        } catch (e: any) {
            setError(e?.message ?? "Failed");
        } finally {
            setBusy(null);
        }
    }

    async function checkout() {
        setError(null);
        setBusy("checkout");
        try {
            const res = await startCheckout({
                cartId: data.cart?.id ?? undefined,
                successPath: "/checkout/success",
                cancelPath: "/cart",
            });
            window.location.href = res.url;
        } catch (e: any) {
            setError(e?.message ?? "Failed to start checkout");
            setBusy(null);
        }
    }

    if (loading) {
        return <div className="p-6">Loading...</div>;
    }

    return (
        <div className="mx-auto max-w-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Cart</h1>
                <div className="flex gap-2">
                    <button
                        onClick={refresh}
                        className="rounded-xl border px-3 py-2 text-sm"
                        disabled={busy !== null}
                    >
                        Reload
                    </button>
                    <button
                        onClick={clear}
                        className="rounded-xl border px-3 py-2 text-sm"
                        disabled={busy !== null || data.items.length === 0}
                    >
                        Clear
                    </button>
                </div>
            </div>

            {error ? (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            {data.items.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
                    カートは空です
                </div>
            ) : (
                <div className="rounded-2xl border bg-white">
                    <ul className="divide-y">
                        {data.items.map((it) => {
                            const disabled = busy === it.product_id || busy === "checkout";
                            return (
                                <li key={it.id} className="p-4 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{it.title}</div>
                                        <div className="text-sm text-gray-600">
                                            {formatJPY(it.unit_amount)} × {it.quantity}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => dec(it)}
                                            className="rounded-xl border px-3 py-2 text-sm"
                                            disabled={disabled}
                                        >
                                            −
                                        </button>
                                        <div className="w-10 text-center">{it.quantity}</div>
                                        <button
                                            onClick={() => inc(it)}
                                            className="rounded-xl border px-3 py-2 text-sm"
                                            disabled={disabled}
                                        >
                                            +
                                        </button>
                                        <button
                                            onClick={() => remove(it)}
                                            className="rounded-xl border px-3 py-2 text-sm"
                                            disabled={disabled}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="p-4 flex items-center justify-between">
                        <div className="text-sm text-gray-600">Total</div>
                        <div className="text-lg font-semibold">{formatJPY(total)}</div>
                    </div>

                    <div className="p-4 pt-0">
                        <button
                            onClick={checkout}
                            className="w-full rounded-2xl bg-black px-4 py-3 text-white disabled:opacity-60"
                            disabled={busy !== null || data.items.length === 0}
                        >
                            {busy === "checkout" ? "Redirecting..." : "Checkout"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
