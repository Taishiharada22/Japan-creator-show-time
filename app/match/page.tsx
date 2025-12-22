// app/match/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Category = {
    id: string;
    name_ja: string;
};

type Maker = {
    id: string;
    display_name: string | null;
    prefecture: string | null;
    intro_ja: string | null;
};

type Product = {
    id: string;
    title_ja: string | null;
    description: string | null;
    price_jpy: number | null;
    is_experience: boolean | null;
    creator: {
        id: string;
        display_name: string | null;
        prefecture: string | null;
    } | null;
};

const PREFECTURES = [
    "北海道",
    "青森県",
    "岩手県",
    "宮城県",
    "秋田県",
    "山形県",
    "福島県",
    "茨城県",
    "栃木県",
    "群馬県",
    "埼玉県",
    "千葉県",
    "東京都",
    "神奈川県",
    "新潟県",
    "富山県",
    "石川県",
    "福井県",
    "山梨県",
    "長野県",
    "岐阜県",
    "静岡県",
    "愛知県",
    "三重県",
    "滋賀県",
    "京都府",
    "大阪府",
    "兵庫県",
    "奈良県",
    "和歌山県",
    "鳥取県",
    "島根県",
    "岡山県",
    "広島県",
    "山口県",
    "徳島県",
    "香川県",
    "愛媛県",
    "高知県",
    "福岡県",
    "佐賀県",
    "長崎県",
    "熊本県",
    "大分県",
    "宮崎県",
    "鹿児島県",
    "沖縄県",
];

const RELATIONS = [
    {
        value: "visit",
        label: "工房見学をしてみたい",
        expl: "まずは会いに行って話を聞きたい",
    },
    {
        value: "experience",
        label: "一緒に作ってみたい",
        expl: "ワークショップ・体験プランメイン",
    },
    {
        value: "deep",
        label: "将来、自分も作り手を目指したい",
        expl: "弟子入り・長期的な関係を視野に入れたい",
    },
];

export default function MatchPage() {
    const [loading, setLoading] = useState(false);
    const [initLoading, setInitLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
    const [selectedPrefecture, setSelectedPrefecture] = useState<string>("");
    const [selectedRelation, setSelectedRelation] = useState<string>("visit");

    const [makers, setMakers] = useState<Maker[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    // 初期表示：カテゴリ一覧を取得（＋今後はここでユーザーの好みもロードしてデフォルト値にする）
    useEffect(() => {
        const loadInitial = async () => {
            setInitLoading(true);
            setError(null);

            // --- カテゴリ一覧を取得（カラム名に依存しない形） ---
            const { data: categoryData, error: categoryError } = await supabase
                .from("categories_master") // テーブル名だけ固定
                .select("*");              // とりあえず全カラム取る

            if (categoryError) {
                // console.error だと Next が赤画面にするので log にしておく
                console.log("categoryError:", categoryError);
                // ここで致命的エラーにするかどうかはお好み
                // 一旦、画面だけは動かしたいので setError は軽めに。
                setError("カテゴリ情報の取得中にエラーが発生しました。");
            } else if (categoryData) {
                // カラム名が name_ja / title_ja / name のどれでも対応できるようにする
                const mapped = (categoryData as any[]).map((row) => ({
                    id: row.id,
                    name_ja:
                        row.name_ja ??
                        row.title_ja ??
                        row.name ??
                        String(row.id ?? "カテゴリ"),
                }));

                setCategories(mapped);
            }

            setInitLoading(false);
        };

        loadInitial();
    }, []);


    // 検索ボタン押下時
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // ---- 作り手の検索 ----
            let makerQuery = supabase
                .from("profiles")
                .select("id, display_name, prefecture, intro_ja")
                .eq("is_creator", true); // クリエイターだけ

            if (selectedPrefecture) {
                makerQuery = makerQuery.eq("prefecture", selectedPrefecture);
            }

            // クリエイター側に「得意カテゴリ」カラムを作った場合はここで条件追加
            // 例：maker_main_category_id など
            if (selectedCategoryId) {
                makerQuery = makerQuery.eq(
                    "preferred_category_id",
                    selectedCategoryId
                );
            }

            const { data: makerData, error: makerError } = await makerQuery;

            if (makerError) {
                console.error("makerError", makerError);
                throw new Error("作り手の検索中にエラーが発生しました。");
            }

            setMakers((makerData as Maker[]) || []);

            // ---- プロダクト / 体験プランの検索 ----
            let productQuery = supabase
                .from("products")
                .select(
                    `
    id,
    title_ja,
    description,
    price_jpy,
    is_experience,
    creator:profiles (
      id,
      display_name,
      prefecture
    )
  `
                )
                .eq("status", "public");

            if (selectedCategoryId) {
                productQuery = productQuery.eq("category_id", selectedCategoryId);
            }

            const { data: productData, error: productError } = await productQuery;

            if (productError) {
                console.error("productError", productError);
                throw new Error("プロダクトの検索中にエラーが発生しました。");
            }

            // ★ ここを修正：null をつぶしてから Product[] として扱う
            const typedProducts: Product[] = ((productData ?? []) as unknown) as Product[];

            // 都道府県フィルタは join 側の prefecture を使って JS で絞り込み
            const filteredProducts = typedProducts.filter((p) => {
                if (!selectedPrefecture) return true;
                return p.creator?.prefecture === selectedPrefecture;
            });

            setProducts(filteredProducts);

        } catch (err: any) {
            setError(err.message ?? "検索中にエラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="max-w-5xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-2">職人マッチング</h1>
            <p className="text-sm text-gray-700 mb-6">
                観光地やグルメからではなく、{" "}
                <span className="font-semibold">「会いたい職人」</span>
                から旅を組み立てるためのページです。
                興味のあるジャンル・雰囲気・行きたいエリアを選ぶと、相性の良さそうな
                作り手とプロダクト／体験プランをおすすめします。
            </p>

            {/* 検索条件フォーム */}
            <section className="border rounded-lg p-4 mb-8 bg-white">
                <h2 className="text-lg font-semibold mb-4">条件をえらぶ</h2>

                {initLoading ? (
                    <p className="text-sm text-gray-600">読み込み中です…</p>
                ) : (
                    <form onSubmit={handleSearch} className="space-y-4">
                        {/* 興味ジャンル */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                興味のあるジャンル
                            </label>
                            <select
                                className="w-full border rounded px-3 py-2 text-sm"
                                value={selectedCategoryId}
                                onChange={(e) => setSelectedCategoryId(e.target.value)}
                            >
                                <option value="">指定しない（全ジャンル）</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name_ja}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 行きたい都道府県 */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                行きたいエリア（都道府県）
                            </label>
                            <select
                                className="w-full border rounded px-3 py-2 text-sm"
                                value={selectedPrefecture}
                                onChange={(e) => setSelectedPrefecture(e.target.value)}
                            >
                                <option value="">指定しない（全国）</option>
                                {PREFECTURES.map((pref) => (
                                    <option key={pref} value={pref}>
                                        {pref}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* どれくらい関わりたいか */}
                        <div>
                            <p className="block text-sm font-medium mb-1">
                                職人さんとどれくらい関わりたい？
                            </p>
                            <div className="space-y-2">
                                {RELATIONS.map((r) => (
                                    <label
                                        key={r.value}
                                        className="flex items-start gap-2 text-sm cursor-pointer"
                                    >
                                        <input
                                            type="radio"
                                            name="relation"
                                            value={r.value}
                                            checked={selectedRelation === r.value}
                                            onChange={() => setSelectedRelation(r.value)}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="font-medium">{r.label}</span>
                                            <span className="block text-gray-600 text-xs">
                                                {r.expl}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                className="inline-flex items-center px-4 py-2 rounded bg-black text-white text-sm font-semibold disabled:opacity-60"
                                disabled={loading}
                            >
                                {loading ? "検索中…" : "この条件でおすすめを見る"}
                            </button>
                        </div>

                        {error && (
                            <p className="text-sm text-red-600 mt-1 whitespace-pre-line">
                                {error}
                            </p>
                        )}
                    </form>
                )}
            </section>

            {/* 結果表示 */}
            <section className="space-y-8">
                {/* 作り手候補 */}
                <div>
                    <h2 className="text-lg font-semibold mb-3">おすすめの作り手</h2>
                    {makers.length === 0 ? (
                        <p className="text-sm text-gray-600">
                            まだ条件を指定していないか、一致する作り手がいません。
                        </p>
                    ) : (
                        <ul className="grid gap-4 md:grid-cols-2">
                            {makers.map((maker) => (
                                <li
                                    key={maker.id}
                                    className="border rounded-lg p-4 bg-white flex flex-col justify-between"
                                >
                                    <div>
                                        <h3 className="text-base font-semibold mb-1">
                                            {maker.display_name ?? "名前未設定の作り手"}
                                        </h3>
                                        <p className="text-xs text-gray-600 mb-1">
                                            拠点: {maker.prefecture ?? "未登録"}
                                        </p>
                                        <p className="text-sm text-gray-800 line-clamp-3">
                                            {maker.intro_ja ?? "自己紹介文は準備中です。"}
                                        </p>
                                    </div>
                                    <div className="mt-3">
                                        <Link
                                            href={`/makers/${maker.id}`}
                                            className="text-xs font-semibold text-blue-700 underline"
                                        >
                                            この作り手のページを見る
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* プロダクト／体験候補 */}
                <div>
                    <h2 className="text-lg font-semibold mb-3">
                        おすすめのプロダクト・体験プラン
                    </h2>
                    {products.length === 0 ? (
                        <p className="text-sm text-gray-600">
                            まだ条件を指定していないか、一致するプロダクトがありません。
                        </p>
                    ) : (
                        <ul className="space-y-3">
                            {products.map((product) => (
                                <li
                                    key={product.id}
                                    className="border rounded-lg p-4 bg-white flex flex-col gap-2"
                                >
                                    <div className="flex justify-between gap-4">
                                        <div>
                                            <h3 className="text-base font-semibold mb-1">
                                                {product.title_ja ?? "タイトル未設定"}
                                            </h3>
                                            <p className="text-xs text-gray-600 mb-1">
                                                {product.creator?.display_name
                                                    ? `作り手: ${product.creator.display_name}`
                                                    : "作り手情報なし"}
                                                {product.creator?.prefecture &&
                                                    `（${product.creator.prefecture}）`}
                                            </p>
                                        </div>
                                        <div className="text-right text-sm">
                                            <p className="font-semibold">
                                                {product.price_jpy != null
                                                    ? `¥${product.price_jpy.toLocaleString()}`
                                                    : "価格未設定"}
                                            </p>
                                            <p className="text-xs text-gray-600">
                                                {product.is_experience ? "体験プラン" : "物販プロダクト"}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-800 line-clamp-2">
                                        {product.description ?? "説明文は準備中です。"}
                                    </p>
                                    <div>
                                        <Link
                                            href={`/products/${product.id}`}
                                            className="text-xs font-semibold text-blue-700 underline"
                                        >
                                            このプロダクトの詳細を見る
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>
        </main>
    );
}
