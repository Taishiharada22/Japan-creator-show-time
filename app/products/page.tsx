// app/products/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = {
    id: string;
    name: string | null;
    slug: string | null;
    currency: string | null;
    price_minor: number | null;
    price_jpy: number | null;
    status?: string | null;
};

function money(currency: string | null, minor: number | null) {
    const cur = String(currency ?? "JPY").toUpperCase();
    const n = Number(minor ?? 0);
    if (cur === "JPY") return `¥${n.toLocaleString()}`;
    if (cur === "USD") return `$${(n / 100).toFixed(2)}`;
    return `${cur} ${n}`;
}

export default async function ProductsPage() {
    const { data, error } = await supabaseAdmin
        .from("products")
        .select("id,name,slug,currency,price_minor,price_jpy,status")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("products list error:", error);
    }

    const rows = ((data ?? []) as ProductRow[])
        // 公開のみ表示（必要なら外してOK）
        .filter((p) => {
            const s = String(p.status ?? "").toLowerCase();
            return !s || s === "public" || s === "active" || s === "published";
        });

    return (
        <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-extrabold tracking-tight">Products</h1>
                    <p className="text-sm text-gray-600">商品一覧</p>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href="/cart"
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                    >
                        Cart
                    </Link>
                    <Link
                        href="/orders"
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                    >
                        Orders
                    </Link>
                </div>
            </header>

            {rows.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700">商品がありません</div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {rows.map((p) => {
                        const href = `/products/${encodeURIComponent(p.slug ?? p.id)}`;
                        return (
                            <Link
                                key={p.id}
                                href={href}
                                className="rounded-2xl border bg-white p-5 hover:border-gray-400"
                            >
                                <div className="font-extrabold text-lg">{p.name ?? "Product"}</div>
                                <div className="mt-1 text-sm text-gray-600">{money(p.currency, p.price_minor)}</div>
                                <div className="mt-2 text-xs text-gray-400 break-all">{p.slug ?? p.id}</div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
