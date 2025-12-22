// app/products/page.tsx
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type SearchParams = { [key: string]: string | string[] | undefined };

function firstOf(param: string | string[] | undefined): string | undefined {
    if (Array.isArray(param)) return param[0];
    return param;
}

function isUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        v
    );
}

function formatJPY(n: number | null | undefined) {
    if (typeof n !== "number") return "価格未設定";
    return `¥${n.toLocaleString()}`;
}

function toImageUrl(image_path?: string | null, image_url?: string | null) {
    if (image_url && image_url.startsWith("http")) return image_url;

    const path = image_path ?? image_url;
    if (!path) return null;

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return null;

    return `${base}/storage/v1/object/public/product-images/${path}`;
}

export default async function ProductsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const keyword = firstOf(searchParams.q) ?? "";
    const typeParam = (firstOf(searchParams.type) ??
        "all") as "all" | "experience" | "product";
    const minPriceParam = firstOf(searchParams.minPrice);
    const maxPriceParam = firstOf(searchParams.maxPrice);

    let query = supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

    // buyer側一覧は基本 public だけ見せるのが自然（必要なら外してOK）
    query = query.eq("status", "public");

    if (keyword.trim() !== "") {
        const k = keyword.trim();
        query = query.or(`title_ja.ilike.%${k}%,description.ilike.%${k}%`);
    }

    if (typeParam === "experience") query = query.eq("is_experience", true);
    if (typeParam === "product") query = query.eq("is_experience", false);

    if (minPriceParam) {
        const min = Number(minPriceParam);
        if (!Number.isNaN(min)) query = query.gte("price_jpy", min);
    }
    if (maxPriceParam) {
        const max = Number(maxPriceParam);
        if (!Number.isNaN(max)) query = query.lte("price_jpy", max);
    }

    const { data: products, error } = await query;

    const rows = (products ?? []).filter((p: any) => {
        // ✅ id がない/uuidじゃないものはリンクを作らない（= /products/undefinedを防ぐ）
        const id = p?.id;
        return typeof id === "string" && isUuid(id);
    });

    return (
        <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold">プロダクト一覧</h1>
                <p className="text-sm text-gray-600">
                    サムネ＋短い説明で探して、詳細でしっかり読む。
                </p>

                <div className="flex flex-wrap gap-3 text-sm">
                    <Link href="/" className="underline text-gray-600">
                        ホーム
                    </Link>
                    <Link href="/product-search" className="underline text-gray-600">
                        詳細検索（別ページ）
                    </Link>
                    <Link
                        href="/products/new"
                        className="ml-auto rounded-full border px-4 py-2 hover:bg-gray-50"
                    >
                        出品（新規登録）
                    </Link>
                </div>
            </header>

            {/* 検索フォーム（GET） */}
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
                <form className="grid gap-4 md:grid-cols-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">
                            キーワード（作品名・説明）
                        </label>
                        <input
                            type="text"
                            name="q"
                            defaultValue={keyword}
                            placeholder="例：藍染、山梨、ワークショップ…"
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-500 mb-1">種別</label>
                        <select
                            name="type"
                            defaultValue={typeParam}
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                        >
                            <option value="all">すべて</option>
                            <option value="experience">体験プラン</option>
                            <option value="product">物販</option>
                        </select>
                    </div>

                    <div className="flex items-end gap-2">
                        <div className="w-full">
                            <label className="block text-xs text-gray-500 mb-1">最小</label>
                            <input
                                type="number"
                                name="minPrice"
                                defaultValue={minPriceParam ?? ""}
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                min={0}
                            />
                        </div>
                        <div className="w-full">
                            <label className="block text-xs text-gray-500 mb-1">最大</label>
                            <input
                                type="number"
                                name="maxPrice"
                                defaultValue={maxPriceParam ?? ""}
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                min={0}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-4 flex justify-end">
                        <button className="rounded-full bg-black text-white px-5 py-2 text-sm">
                            この条件で検索
                        </button>
                    </div>
                </form>
            </section>

            {/* 結果 */}
            <section className="space-y-3">
                <div className="flex items-end justify-between">
                    <h2 className="text-lg font-semibold">
                        検索結果{" "}
                        <span className="text-sm text-gray-500">
                            （{rows.length} 件）
                        </span>
                    </h2>
                </div>

                {error && (
                    <div className="rounded-xl border p-4 text-sm text-red-600 bg-white">
                        検索中にエラーが発生しました：{" "}
                        <span className="font-mono">{(error as any).message ?? ""}</span>
                    </div>
                )}

                {!error && rows.length === 0 && (
                    <p className="text-sm text-gray-600">
                        条件に一致するプロダクトがありませんでした。
                    </p>
                )}

                <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {rows.map((p: any) => {
                        const img = toImageUrl(p.image_path ?? null, p.image_url ?? null);
                        const badge = p.is_experience ? "体験" : "物販";
                        const price = formatJPY(p.price_jpy);
                        const desc = (p.description ?? "").toString();

                        return (
                            <li
                                key={p.id}
                                className="rounded-2xl border bg-white shadow-sm overflow-hidden"
                            >
                                <div className="aspect-[4/3] bg-gray-100 relative">
                                    {img ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={img}
                                            alt={p.title_ja ?? "product"}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-xs text-gray-500">
                                            No Image
                                        </div>
                                    )}

                                    <div className="absolute top-3 left-3 flex gap-2">
                                        <span className="rounded-full bg-white/90 border px-3 py-1 text-xs">
                                            {badge}
                                        </span>
                                        <span className="rounded-full bg-white/90 border px-3 py-1 text-xs font-semibold">
                                            {price}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-4 space-y-2">
                                    <h3 className="font-semibold leading-snug line-clamp-2">
                                        <Link
                                            href={`/products/${p.id}`}
                                            className="hover:underline"
                                        >
                                            {p.title_ja ?? "タイトル未設定"}
                                        </Link>
                                    </h3>

                                    <p className="text-sm text-gray-700 line-clamp-3">
                                        {desc || "説明文は準備中です。"}
                                    </p>

                                    {p.creator_id && (
                                        <Link
                                            href={`/makers/${p.creator_id}`}
                                            className="text-xs text-blue-700 underline"
                                        >
                                            この作り手を見る
                                        </Link>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </main>
    );
}
