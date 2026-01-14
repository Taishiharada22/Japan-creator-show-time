"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type OrderRow = {
    id: string;
    status: string;
    currency: string;
    amount_total_minor: number | null;
    created_at: string;
};

function money(currency: string, minor: number) {
    const cur = (currency ?? "JPY").toUpperCase();
    if (cur === "JPY") return `¥${Number(minor).toLocaleString()}`;
    if (cur === "USD") return `$${(Number(minor) / 100).toFixed(2)}`;
    return `${cur} ${Number(minor)}`;
}

async function getAccessTokenOrNull() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
}

export default function OrdersPage() {
    const [loading, setLoading] = useState(true);
    const [loggedIn, setLoggedIn] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [orders, setOrders] = useState<OrderRow[]>([]);

    const load = async () => {
        setLoading(true);
        setErr(null);

        try {
            const token = await getAccessTokenOrNull();
            setLoggedIn(!!token);

            if (!token) {
                setOrders([]);
                return;
            }

            const res = await fetch("/api/orders", {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || `failed (${res.status})`);

            setOrders((json?.orders ?? []) as OrderRow[]);
        } catch (e: any) {
            console.error("orders load error:", e);
            setErr(e?.message ?? "failed");
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        const { data } = supabase.auth.onAuthStateChange(() => void load());
        return () => data.subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-extrabold tracking-tight">Orders</h1>
                    <p className="text-sm text-gray-600">購入履歴</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void load()}
                        disabled={loading}
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500 disabled:opacity-60"
                    >
                        Reload
                    </button>
                    <Link
                        href="/products"
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                    >
                        Products
                    </Link>
                    <Link
                        href="/cart"
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                    >
                        Cart
                    </Link>
                </div>
            </header>

            {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
            )}

            {loading ? (
                <p className="text-sm text-gray-600">読み込み中...</p>
            ) : !loggedIn ? (
                <div className="rounded-2xl border bg-white p-6 space-y-3">
                    <div className="font-bold">ログインが必要です</div>
                    <Link
                        href="/login"
                        className="inline-block rounded-xl bg-black px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"
                    >
                        Login
                    </Link>
                </div>
            ) : orders.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700">注文はまだありません</div>
            ) : (
                <div className="rounded-2xl border bg-white p-6 space-y-3">
                    {orders.map((o) => (
                        <Link
                            key={o.id}
                            href={`/orders/${encodeURIComponent(o.id)}`}
                            className="block rounded-xl border p-4 hover:border-gray-400"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-extrabold">Status: {o.status}</div>
                                    <div className="text-xs text-gray-500 break-all">{o.id}</div>
                                </div>

                                <div className="text-right">
                                    <div className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</div>
                                    <div className="text-lg font-extrabold">
                                        {money(o.currency ?? "JPY", Number(o.amount_total_minor ?? 0))}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
