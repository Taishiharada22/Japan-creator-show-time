// app/products/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import InquiryForm from "./InquiryForm";

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

    // public bucket 前提（product-images）
    return `${base}/storage/v1/object/public/product-images/${path}`;
}

export default async function ProductDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    // ✅ ここが超重要：undefined / uuidじゃない値なら DB に投げない
    if (!id || id === "undefined" || !isUuid(id)) {
        return notFound();
    }

    const { data: product, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    // ✅ エラーなら「404に偽装」しない。原因を画面に出す
    if (error) {
        const code = (error as any).code ?? "";
        const msg = (error as any).message ?? "";
        const details = (error as any).details ?? "";
        const hint = (error as any).hint ?? "";

        return (
            <main className="max-w-3xl mx-auto px-4 py-10 space-y-4">
                <h1 className="text-2xl font-bold">Product Detail Error</h1>
                <p className="text-sm text-gray-700">
                    DB 取得でエラーが出ています（404ではありません）。
                </p>

                <div className="rounded-xl border p-4 bg-white space-y-2">
                    <p className="text-sm">
                        <span className="font-semibold">code:</span>{" "}
                        <span className="font-mono">{code || "-"}</span>
                    </p>
                    <p className="text-sm">
                        <span className="font-semibold">message:</span>{" "}
                        <span className="font-mono break-all">{msg || "-"}</span>
                    </p>
                    {details && (
                        <p className="text-sm">
                            <span className="font-semibold">details:</span>{" "}
                            <span className="font-mono break-all">{details}</span>
                        </p>
                    )}
                    {hint && (
                        <p className="text-sm">
                            <span className="font-semibold">hint:</span>{" "}
                            <span className="font-mono break-all">{hint}</span>
                        </p>
                    )}
                </div>

                <div className="flex gap-3 pt-2">
                    <Link
                        href="/products"
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        一覧へ戻る
                    </Link>
                    <Link
                        href="/product-search"
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        検索へ
                    </Link>
                </div>
            </main>
        );
    }

    if (!product) return notFound();

    const badge = product.is_experience ? "体験プラン" : "物販";
    const price = formatJPY(product.price_jpy);
    const img = toImageUrl(product.image_path ?? null, product.image_url ?? null);

    return (
        <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
            <div className="text-xs text-gray-500 flex items-center gap-2">
                <Link href="/" className="underline">
                    ホーム
                </Link>
                <span>/</span>
                <Link href="/products" className="underline">
                    プロダクト
                </Link>
                <span>/</span>
                <span className="truncate">{product.title_ja ?? "詳細"}</span>
            </div>

            <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
                <div className="grid md:grid-cols-2">
                    <div className="relative aspect-[4/3] bg-gray-100">
                        {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={img}
                                alt={product.title_ja ?? "product image"}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-xs text-gray-500">
                                No Image
                            </div>
                        )}

                        <div className="absolute top-3 left-3 flex gap-2">
                            <span className="rounded-full bg-white/90 backdrop-blur border px-3 py-1 text-xs">
                                {badge}
                            </span>
                            <span className="rounded-full bg-white/90 backdrop-blur border px-3 py-1 text-xs font-semibold">
                                {price}
                            </span>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <h1 className="text-2xl font-bold">
                            {product.title_ja ?? "タイトル未設定"}
                        </h1>

                        <div className="text-sm text-gray-600">
                            <p>
                                ステータス：
                                <span className="ml-1 font-semibold">{product.status ?? "-"}</span>
                            </p>
                            <p>
                                種別：<span className="ml-1 font-semibold">{badge}</span>
                            </p>
                            <p>
                                価格：<span className="ml-1 font-semibold">{price}</span>
                            </p>
                        </div>

                        <div className="pt-2">
                            <h2 className="text-sm font-semibold mb-1">説明</h2>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-6">
                                {product.description || "説明文は準備中です。"}
                            </p>
                        </div>

                        {/* ✅ ここに追加（説明の下） */}
                        <div className="pt-4">
                            <InquiryForm
                                productId={id}
                                makerId={product.creator_id ?? null}
                                productName={product.title_ja ?? ""}
                                productUrl={`/products/${id}`}
                                sourcePath={`/products/${id}`}
                                isExperience={!!product.is_experience}
                            />
                        </div>


                        {product.creator_id && (
                            <div className="pt-2">
                                <Link
                                    href={`/makers/${product.creator_id}`}
                                    className="text-sm underline text-blue-700"
                                >
                                    この作り手のページを見る
                                </Link>
                            </div>
                        )}

                        <div className="pt-4 flex gap-3">
                            <Link
                                href="/products"
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                            >
                                一覧に戻る
                            </Link>
                            <Link
                                href="/product-search"
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                            >
                                検索へ
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
