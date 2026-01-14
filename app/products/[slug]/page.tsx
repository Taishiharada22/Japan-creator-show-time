// app/products/[slug]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AddToCart from "./AddToCart";

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

function looksLikeUuid(s: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function money(currency: string | null, minor: number | null) {
    const cur = String(currency ?? "JPY").toUpperCase();
    const n = Number(minor ?? 0);
    if (cur === "JPY") return `¥${n.toLocaleString()}`;
    if (cur === "USD") return `$${(n / 100).toFixed(2)}`;
    return `${cur} ${n}`;
}

export default async function ProductDetailPage(props: { params: Promise<{ slug: string }> }) {
    // ✅ Next 16 / Turbopack: params が Promise のことがある
    const { slug } = await props.params;
    const key = String(slug ?? "").trim();
    if (!key) notFound();

    let row: ProductRow | null = null;

    // 1) slug で探す
    const { data: bySlug, error: e1 } = await supabaseAdmin
        .from("products")
        .select("id,name,slug,currency,price_minor,price_jpy,status")
        .eq("slug", key)
        .maybeSingle();

    if (e1) console.error("product detail error(slug):", e1);
    row = (bySlug as ProductRow | null) ?? null;

    // 2) fallback: UUID っぽければ id でも探す
    if (!row?.id && looksLikeUuid(key)) {
        const { data: byId, error: e2 } = await supabaseAdmin
            .from("products")
            .select("id,name,slug,currency,price_minor,price_jpy,status")
            .eq("id", key)
            .maybeSingle();

        if (e2) console.error("product detail error(id):", e2);
        row = (byId as ProductRow | null) ?? null;
    }

    if (!row?.id) notFound();

    // 公開ステータス以外は 404
    const st = String(row.status ?? "").toLowerCase();
    if (st && st !== "public" && st !== "active" && st !== "published") notFound();

    return (
        <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                    <h1 className="text-3xl font-extrabold tracking-tight truncate">{row.name ?? "Product"}</h1>
                    <p className="text-sm text-gray-600 truncate">{row.slug ?? row.id}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href="/products"
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                    >
                        ← Products
                    </Link>
                    <Link
                        href="/cart"
                        className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                    >
                        Cart
                    </Link>
                </div>
            </header>

            <section className="rounded-2xl border bg-white p-6 space-y-3">
                <div className="text-sm text-gray-500">Price</div>
                <div className="text-2xl font-extrabold">{money(row.currency, row.price_minor)}</div>

                <div className="pt-3">
                    <AddToCart productId={row.id} />
                </div>
            </section>
        </main>
    );
}
