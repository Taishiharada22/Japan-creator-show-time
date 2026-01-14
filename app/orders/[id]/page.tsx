// app/orders/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OrderRow = {
    id: string;
    status: string;
    currency: string;
    amount_subtotal_minor: number | null;
    amount_total_minor: number | null;
    created_at: string;
};

type OrderItemRow = {
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    unit_price_minor: number;
    currency: string;
    products: { id: string; name: string | null; slug: string | null } | null;
};

function money(currency: string, minor: number) {
    const cur = (currency ?? "JPY").toUpperCase();
    if (cur === "JPY") return `¥${Number(minor).toLocaleString()}`;
    if (cur === "USD") return `$${(Number(minor) / 100).toFixed(2)}`;
    return `${cur} ${Number(minor)}`;
}

function statusBadge(status: string) {
    const s = String(status ?? "").toLowerCase();
    if (s === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "canceled" || s === "cancelled") return "bg-gray-100 text-gray-700 border-gray-200";
    if (s === "refunded") return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
}

async function getAccessTokenOrNull() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
}

export default function OrderDetailPage() {
    const params = useParams();
    const raw = (params as any)?.id;

    // ✅ string|string[]|undefined を吸収
    const id = useMemo(() => {
        const v = Array.isArray(raw) ? raw[0] : raw;
        return String(v ?? "").trim();
    }, [raw]);

    const [loading, setLoading] = useState(true);
    const [loggedIn, setLoggedIn] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [order, setOrder] = useState<OrderRow | null>(null);
    const [items, setItems] = useState<OrderItemRow[]>([]);
    const [computedTotalMinor, setComputedTotalMinor] = useState<number>(0);

    const load = async () => {
        setLoading(true);
        setErr(null);

        try {
            const token = await getAccessTokenOrNull();
            setLoggedIn(!!token);

            if (!token) {
                setOrder(null);
                setItems([]);
                setComputedTotalMinor(0);
                return;
            }
            if (!id) {
                setOrder(null);
                setItems([]);
                setComputedTotalMinor(0);
                return;
            }

            const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || `failed (${res.status})`);

            setOrder((json?.order ?? null) as OrderRow | null);
            setItems((json?.items ?? []) as OrderItemRow[]);
            setComputedTotalMinor(Number(json?.totals?.computed_total_minor ?? 0));
        } catch (e: any) {
            console.error("order detail load error:", e);
            setErr(e?.message ?? "failed");
            setOrder(null);
            setItems([]);
            setComputedTotalMinor(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        const { data } = supabase.auth.onAuthStateChange(() => void load());
        return () => data.subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const currency = useMemo(() => {
        return (order?.currency ?? items[0]?.currency ?? "JPY").toUpperCase();
    }, [order, items]);

    const lineTotal = (it: OrderItemRow) =>
        Number(it.unit_price_minor ?? 0) * Number(it.quantity ?? 0);

    const totalMinor = useMemo(() => {
        // DB優先 → 無ければAPI計算値 → 無ければ画面側で再計算
        const db = Number(order?.amount_total_minor ?? 0);
        if (db > 0) return db;
        if (computedTotalMinor > 0) return computedTotalMinor;
        return items.reduce((sum, it) => sum + lineTotal(it), 0);
    }, [order, computedTotalMinor, items]);

    const createdLabel = useMemo(() => {
        const v = order?.created_at;
        if (!v) return "";
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return String(v);
        return d.toLocaleString();
    }, [order?.created_at]);

    const copyId = async () => {
        if (!id) return;
        try {
            await navigator.clipboard.writeText(id);
        } catch {
            // noop
        }
    };

    return (
        <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                    <h1 className="text-3xl font-extrabold tracking-tight truncate">Order detail</h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-gray-600 break-all">{id || "(missing id)"}</p>
                        {id && (
                            <button
                                onClick={copyId}
                                className="rounded-lg border bg-white px-2 py-1 text-xs font-bold hover:border-gray-500"
                            >
                                Copy
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => void load()}
                        disabled={loading}
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500 disabled:opacity-60"
                    >
                        Reload
                    </button>
                    <Link href="/orders" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500">
                        ← Orders
                    </Link>
                    <Link href="/cart" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500">
                        Cart
                    </Link>
                    <Link href="/products" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500">
                        Products
                    </Link>
                </div>
            </header>

            {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {err}
                </div>
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
            ) : !id ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700">
                    注文IDが取得できません（URLを確認してください）
                </div>
            ) : !order ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700">注文が見つかりません</div>
            ) : (
                <>
                    <section className="rounded-2xl border bg-white p-6 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-600">Status</span>
                                <span className={`rounded-full border px-3 py-1 text-sm font-extrabold ${statusBadge(order.status)}`}>
                                    {order.status}
                                </span>
                            </div>

                            {createdLabel && <div className="text-sm text-gray-600">{createdLabel}</div>}
                        </div>

                        <div className="pt-2 flex flex-wrap items-end justify-between gap-3">
                            <div className="text-sm text-gray-600">Total</div>
                            <div className="text-2xl font-extrabold">{money(currency, totalMinor)}</div>
                        </div>

                        <div className="text-xs text-gray-500">
                            ※ 合計はDBの amount_total_minor を優先。無い場合は明細から計算。
                        </div>
                    </section>

                    <section className="rounded-2xl border bg-white p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="font-extrabold">Items</div>
                            <div className="text-sm text-gray-600">{items.length} item(s)</div>
                        </div>

                        {items.length === 0 ? (
                            <div className="text-sm text-gray-600">明細がありません</div>
                        ) : (
                            <div className="space-y-3">
                                {items.map((it) => {
                                    const line = lineTotal(it);
                                    const href = it.products?.slug ? `/products/${it.products.slug}` : null;

                                    return (
                                        <div key={it.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                            <div className="min-w-0 space-y-1">
                                                <div className="font-bold">
                                                    {href ? (
                                                        <Link href={href} className="hover:underline">
                                                            {it.products?.name ?? "Unknown product"}
                                                        </Link>
                                                    ) : (
                                                        it.products?.name ?? "Unknown product"
                                                    )}
                                                </div>

                                                <div className="text-sm text-gray-600">
                                                    {money(it.currency, it.unit_price_minor)} × {it.quantity}
                                                </div>

                                                <div className="text-xs text-gray-400 break-all">{it.product_id}</div>

                                                {href && (
                                                    <div className="text-xs">
                                                        <Link href={href} className="font-bold text-gray-700 hover:underline">
                                                            View product →
                                                        </Link>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="text-right">
                                                <div className="text-xs text-gray-500">Line total</div>
                                                <div className="text-lg font-extrabold">{money(it.currency, line)}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </>
            )}
        </main>
    );
}
