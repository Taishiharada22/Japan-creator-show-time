"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
    id: string;
    title_ja: string | null;
    description: string | null;
    is_experience: boolean | null;
    price_jpy: number | null;
    status: string | null;
    creator_id: string | null;
    created_at?: string | null;
};

type ExperienceFilter = "all" | "experience" | "product";

function yen(n: number | null) {
    if (typeof n !== "number") return "価格未設定";
    try {
        return `¥${n.toLocaleString()}`;
    } catch {
        return `¥${n}`;
    }
}

// URL用に最低限だけ安全化（or(...)が壊れやすいので）
function safeKeyword(raw: string) {
    const s = raw.trim();
    if (!s) return "";
    return s.replaceAll(",", " ").replaceAll("%", "").replaceAll("_", "").slice(0, 80);
}

function normalizeType(raw: string | null): ExperienceFilter {
    const t = (raw ?? "all") as ExperienceFilter;
    return (["all", "experience", "product"] as const).includes(t) ? t : "all";
}

function toNumberOrNull(s: string) {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    if (Number.isNaN(n)) return null;
    return n;
}

function readSearchParamsFromLocation(): { q: string; type: ExperienceFilter; min: string; max: string } {
    if (typeof window === "undefined") {
        return { q: "", type: "all", min: "", max: "" };
    }
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q") ?? "";
    const type = normalizeType(sp.get("type"));
    const min = sp.get("min") ?? "";
    const max = sp.get("max") ?? "";
    return { q, type, min, max };
}

export default function ProductSearchClient() {
    const router = useRouter();

    // state（URLと同期する）
    const [keyword, setKeyword] = useState("");
    const [experienceFilter, setExperienceFilter] = useState<ExperienceFilter>("all");
    const [minPrice, setMinPrice] = useState<string>("");
    const [maxPrice, setMaxPrice] = useState<string>("");

    const [products, setProducts] = useState<ProductRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const normalizedKeyword = useMemo(() => safeKeyword(keyword), [keyword]);

    const buildQueryString = () => {
        const params = new URLSearchParams();

        if (normalizedKeyword) params.set("q", normalizedKeyword);
        if (experienceFilter !== "all") params.set("type", experienceFilter);

        const min = minPrice.trim();
        const max = maxPrice.trim();
        if (min) params.set("min", min);
        if (max) params.set("max", max);

        const qs = params.toString();
        return qs ? `?${qs}` : "";
    };

    async function fetchProducts(input: { q: string; type: ExperienceFilter; min: string; max: string }) {
        setLoading(true);
        setErrorMessage(null);

        const qSafe = safeKeyword(input.q);
        const type = input.type;

        let query = supabase
            .from("products")
            .select("id, title_ja, description, is_experience, price_jpy, status, creator_id, created_at")
            .eq("status", "public")
            .order("created_at", { ascending: false });

        if (type === "experience") query = query.eq("is_experience", true);
        if (type === "product") query = query.eq("is_experience", false);

        const min = toNumberOrNull(input.min);
        const max = toNumberOrNull(input.max);

        if (min !== null) query = query.gte("price_jpy", min);
        if (max !== null) query = query.lte("price_jpy", max);

        if (qSafe) {
            // ✅ or(...) が壊れないように safeKeyword 済み
            query = query.or(`title_ja.ilike.%${qSafe}%,description.ilike.%${qSafe}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error("product-search error", error);
            setErrorMessage("検索中にエラーが発生しました。DB/RLS/カラム名を確認してください。");
            setProducts([]);
            setLoading(false);
            return;
        }

        setProducts((data ?? []) as ProductRow[]);
        setLoading(false);
    }

    // ✅ 初回 & 戻る/進む（popstate）で URL → state 同期 + fetch
    useEffect(() => {
        const syncAndFetch = () => {
            const { q, type, min, max } = readSearchParamsFromLocation();

            setKeyword(q);
            setExperienceFilter(type);
            setMinPrice(min);
            setMaxPrice(max);

            void fetchProducts({ q, type, min, max });
        };

        syncAndFetch();

        const onPopState = () => syncAndFetch();
        window.addEventListener("popstate", onPopState);

        return () => {
            window.removeEventListener("popstate", onPopState);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const qs = buildQueryString();
        router.push(`/product-search${qs}`);

        // ✅ router.push では popstate が発火しないので、ここで fetch する
        void fetchProducts({
            q: keyword,
            type: experienceFilter,
            min: minPrice,
            max: maxPrice,
        });
    };

    const reset = () => {
        setKeyword("");
        setExperienceFilter("all");
        setMinPrice("");
        setMaxPrice("");

        router.push("/product-search");

        // ✅ 即時反映
        void fetchProducts({ q: "", type: "all", min: "", max: "" });
    };

    const tabBtn = (key: ExperienceFilter, label: string) => {
        const active = experienceFilter === key;
        return (
            <button
                type="button"
                onClick={() => setExperienceFilter(key)}
                className={[
                    "px-4 py-2 rounded-full text-sm border transition",
                    active ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50",
                ].join(" ")}
            >
                {label}
            </button>
        );
    };

    return (
        <main className="max-w-6xl mx-auto px-4 py-10">
            <header className="mb-8">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Product Search</h1>
                        <p className="text-sm text-gray-600 mt-2">日本各地の作品・体験を、キーワード・種別・価格帯で絞り込めます。</p>
                    </div>
                    <div className="text-xs text-gray-500">
                        <Link href="/" className="underline">
                            Home
                        </Link>{" "}
                        /{" "}
                        <Link href="/find-makers" className="underline">
                            Find Makers
                        </Link>
                    </div>
                </div>
            </header>

            <section className="border rounded-2xl p-5 md:p-6 bg-white shadow-sm mb-8">
                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="flex items-center gap-3 flex-wrap">
                        {tabBtn("all", "All")}
                        {tabBtn("experience", "Experience")}
                        {tabBtn("product", "Product")}
                    </div>

                    <div className="grid md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-7">
                            <label className="block text-sm font-medium mb-1">キーワード</label>
                            <input
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                placeholder="例：藍染、ハンカチ、ワークショップ…"
                                className="w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                            <p className="text-xs text-gray-500 mt-1">タイトル / 説明文を対象に検索します</p>
                        </div>

                        <div className="md:col-span-3">
                            <label className="block text-sm font-medium mb-1">価格帯（円）</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    value={minPrice}
                                    onChange={(e) => setMinPrice(e.target.value)}
                                    placeholder="Min"
                                    className="w-full border rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                />
                                <span className="text-gray-400">—</span>
                                <input
                                    type="number"
                                    min={0}
                                    value={maxPrice}
                                    onChange={(e) => setMaxPrice(e.target.value)}
                                    placeholder="Max"
                                    className="w-full border rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2 flex gap-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full rounded-xl bg-black text-white text-sm font-semibold py-3 hover:bg-gray-900 disabled:opacity-60"
                            >
                                {loading ? "検索中…" : "検索"}
                            </button>
                            <button
                                type="button"
                                onClick={reset}
                                className="w-full rounded-xl border border-gray-300 text-sm font-semibold py-3 hover:bg-gray-50"
                            >
                                リセット
                            </button>
                        </div>
                    </div>

                    {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
                </form>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <h2 className="text-xl font-semibold">
                        Results <span className="text-sm text-gray-500">({products.length})</span>
                    </h2>
                </div>

                {loading && (
                    <div className="grid md:grid-cols-2 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="border rounded-2xl p-5 bg-white shadow-sm animate-pulse">
                                <div className="h-5 w-2/3 bg-gray-200 rounded mb-3" />
                                <div className="h-4 w-1/3 bg-gray-200 rounded mb-4" />
                                <div className="h-4 w-full bg-gray-200 rounded mb-2" />
                                <div className="h-4 w-5/6 bg-gray-200 rounded" />
                            </div>
                        ))}
                    </div>
                )}

                {!loading && products.length === 0 && (
                    <div className="border rounded-2xl p-6 text-sm text-gray-600 bg-white">条件に一致するプロダクトがありませんでした。</div>
                )}

                {!loading && products.length > 0 && (
                    <ul className="grid md:grid-cols-2 gap-4">
                        {products.map((p) => {
                            const badge = p.is_experience ? "Experience" : "Product";
                            return (
                                <li key={p.id} className="border rounded-2xl p-5 bg-white shadow-sm hover:shadow-md transition">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-semibold leading-snug">
                                                <Link href={`/products/${p.id}`} className="hover:underline">
                                                    {p.title_ja || "名称未設定のプロダクト"}
                                                </Link>
                                            </h3>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-xs px-2 py-1 rounded-full border border-gray-300 text-gray-700">{badge}</span>
                                                <span className="text-sm font-semibold text-gray-900">{yen(p.price_jpy)}</span>
                                            </div>
                                        </div>

                                        <div className="w-20 h-20 rounded-xl bg-gray-100 border shrink-0" />
                                    </div>

                                    <p className="text-sm text-gray-700 mt-4 line-clamp-3">{p.description || "説明文は準備中です。"}</p>

                                    <div className="mt-4 flex items-center justify-between">
                                        {p.creator_id ? (
                                            <Link href={`/makers/${p.creator_id}`} className="text-sm text-blue-700 hover:underline">
                                                作り手ページを見る
                                            </Link>
                                        ) : (
                                            <span className="text-sm text-gray-400">作り手情報なし</span>
                                        )}

                                        <Link
                                            href={`/products/${p.id}`}
                                            className="text-sm font-semibold rounded-full px-4 py-2 border border-gray-300 hover:bg-gray-50"
                                        >
                                            詳細を見る →
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </main>
    );
}
