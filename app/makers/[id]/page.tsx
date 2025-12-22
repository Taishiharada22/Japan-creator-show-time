import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type MakerDetailPageProps = {
    params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function MakerDetailPage({ params }: MakerDetailPageProps) {
    const { id } = await params;

    if (!id) {
        return (
            <main className="max-w-3xl mx-auto px-4 py-10">
                <h1 className="text-2xl font-bold mb-4">無効なURLです</h1>
                <p className="mb-4">作り手IDが取得できませんでした。</p>
                <Link href="/find-makers" className="text-blue-600 underline">
                    作り手一覧に戻る
                </Link>
            </main>
        );
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, prefecture, bio_ja")
        .eq("id", id)
        .maybeSingle();

    const { data: products, error: productsError } = await supabase
        .from("products")
        .select(
            "id, title_ja, description, is_experience, price_jpy, status, image_url"
        )
        .eq("creator_id", id)
        .order("created_at", { ascending: false });

    if (profileError) console.log("profileError", profileError);
    if (productsError) console.log("productsError", productsError);

    const hasProducts = products && products.length > 0;
    const hasProfile =
        profile &&
        (profile.display_name || profile.prefecture || profile.bio_ja);

    if (!hasProfile && !hasProducts) {
        return (
            <main className="max-w-3xl mx-auto px-4 py-10">
                <h1 className="text-2xl font-bold mb-4">クリエイターが見つかりませんでした</h1>
                <p className="mb-4">
                    URL が間違っているか、このアカウントはまだ公開されていない可能性があります。
                </p>
                <Link href="/find-makers" className="text-blue-600 underline">
                    作り手一覧に戻る
                </Link>
            </main>
        );
    }

    const displayName = profile?.display_name ?? "この作り手";

    return (
        <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
            <div>
                <Link href="/find-makers" className="text-sm text-blue-600 underline">
                    ← 作り手一覧に戻る
                </Link>
            </div>

            <section>
                <h1 className="text-2xl font-bold mb-2">{displayName}</h1>
                <p className="text-sm text-gray-700">
                    拠点：{profile?.prefecture ?? "未設定"}
                </p>
                {profile?.bio_ja ? (
                    <p className="mt-3 text-sm text-gray-800 whitespace-pre-line">
                        {profile.bio_ja}
                    </p>
                ) : (
                    <p className="mt-3 text-sm text-gray-600">
                        プロフィール情報がまだ登録されていませんが、下に作品一覧を表示しています。
                    </p>
                )}
            </section>

            <section>
                <h2 className="text-xl font-semibold mb-4">この作り手のプロダクト</h2>

                {!hasProducts ? (
                    <p>まだ登録されたプロダクトがありません。</p>
                ) : (
                    <ul className="grid gap-4 md:grid-cols-2">
                        {products!.map((p) => (
                            <li key={p.id} className="border rounded-lg p-4 flex flex-col gap-3">
                                {p.image_url && (
                                    <img
                                        src={p.image_url}
                                        alt={p.title_ja ?? "product image"}
                                        className="w-full h-40 object-cover rounded"
                                    />
                                )}

                                <div>
                                    <h3 className="text-lg font-semibold mb-1">
                                        <Link
                                            href={`/products/${p.id}`}
                                            className="text-blue-700 underline"
                                        >
                                            {p.title_ja ?? "名称未設定のプロダクト"}
                                        </Link>
                                    </h3>
                                    <p className="text-xs text-gray-600">
                                        {p.is_experience ? "体験プラン" : "物販プロダクト"}
                                    </p>
                                    <p className="text-sm mt-1">
                                        価格：
                                        {p.price_jpy != null
                                            ? `¥${p.price_jpy.toLocaleString()}`
                                            : "未設定"}
                                    </p>
                                    <p className="text-sm text-gray-700 mt-2 line-clamp-3">
                                        {p.description ?? "説明文は準備中です。"}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        ステータス：{p.status ?? "不明"}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
