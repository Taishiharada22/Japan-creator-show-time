"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// カテゴリ
type Category = {
    id: string;
    name_ja: string;
};

// プロフィール（買い手／作り手共通）
type Profile = {
    id: string;
    display_name: string | null;
    prefecture: string | null;
    preferred_category_id: string | null;
};

// マッチング結果（「この職人 × この作品／体験」）
type MatchResult = {
    productId: string;
    productTitle: string;
    isExperience: boolean;
    priceJpy: number | null;
    creatorId: string;
    creatorName: string | null;
    creatorPrefecture: string | null;
};

export default function BuyerMyPage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    // マッチング検索用の状態
    const [searchCategoryId, setSearchCategoryId] = useState<string>("");
    const [searchPrefecture, setSearchPrefecture] = useState<string>("");
    const [searchType, setSearchType] = useState<"all" | "experience" | "product">(
        "all"
    );
    const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
    const [matching, setMatching] = useState(false);
    const [matchError, setMatchError] = useState<string | null>(null);

    // プロフィール＋カテゴリ一覧の読み込み
    useEffect(() => {
        const load = async () => {
            setLoading(true);

            // 1) ログインユーザー
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
                console.log("userError:", userError);
                setLoading(false);
                return;
            }

            if (!user) {
                setLoading(false);
                return;
            }

            // 2) プロフィール & カテゴリ一覧を並列取得
            const [
                { data: profileData, error: profileError },
                { data: categoryData, error: categoryError },
            ] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id, display_name, prefecture, preferred_category_id")
                    .eq("id", user.id)
                    .maybeSingle(),
                supabase
                    .from("categories_master")
                    .select("id, name_ja")
                    .order("sort_order", { ascending: true }),
            ]);

            // プロフィール
            if (profileError && profileError.code !== "PGRST116") {
                console.log("profileError:", profileError);
            } else if (profileData) {
                const p = profileData as Profile;
                setProfile(p);

                // 好みのカテゴリ＆拠点を初期値として検索条件にセット
                if (p.prefecture) setSearchPrefecture(p.prefecture);
                if (p.preferred_category_id) setSearchCategoryId(p.preferred_category_id);
            }

            // カテゴリ
            if (categoryError) {
                console.log("categoriesError:", categoryError);
            } else if (categoryData) {
                setCategories(categoryData as Category[]);
            }

            setLoading(false);
        };

        load();
    }, []);

    const preferredCategory =
        profile && profile.preferred_category_id
            ? categories.find((c) => c.id === profile.preferred_category_id)
            : undefined;

    // 職人マッチング検索
    const handleMatchSearch = async () => {
        setMatching(true);
        setMatchError(null);
        setMatchResults([]);

        try {
            // 1) 作品／体験（products）を条件で絞り込み
            let query = supabase
                .from("products")
                .select("id, title_ja, price_jpy, is_experience, creator_id, category_id");

            if (searchCategoryId) {
                query = query.eq("category_id", searchCategoryId);
            }

            if (searchType === "experience") {
                query = query.eq("is_experience", true);
            } else if (searchType === "product") {
                query = query.eq("is_experience", false);
            }

            const { data: products, error: productsError } = await query;

            if (productsError) {
                console.log("match productsError:", productsError);
                setMatchError("作品・体験の検索中にエラーが発生しました。");
                setMatching(false);
                return;
            }

            if (!products || products.length === 0) {
                setMatchResults([]);
                setMatching(false);
                return;
            }

            // 2) 関係する作り手プロフィールをまとめて取得
            const creatorIds = Array.from(
                new Set(
                    products
                        .map((p: any) => p.creator_id as string | null)
                        .filter((id): id is string => !!id)
                )
            );

            let creatorsById: Record<
                string,
                { id: string; display_name: string | null; prefecture: string | null }
            > = {};

            if (creatorIds.length > 0) {
                const { data: creators, error: creatorsError } = await supabase
                    .from("profiles")
                    .select("id, display_name, prefecture")
                    .in("id", creatorIds);

                if (creatorsError) {
                    console.log("match creatorsError:", creatorsError);
                } else if (creators) {
                    creatorsById = Object.fromEntries(
                        (creators as any[]).map((c) => [c.id, c])
                    );
                }
            }

            const prefFilter = searchPrefecture.trim();

            // 3) 職人 × 作品 のマッチ結果を組み立て＆地域でフィルタ
            const results: MatchResult[] = (products as any[])
                .map((p) => {
                    const creator = creatorsById[p.creator_id] ?? null;
                    return {
                        productId: p.id,
                        productTitle: p.title_ja ?? "タイトル未設定",
                        isExperience: !!p.is_experience,
                        priceJpy: p.price_jpy ?? null,
                        creatorId: p.creator_id,
                        creatorName: creator?.display_name ?? "名前未設定",
                        creatorPrefecture: creator?.prefecture ?? null,
                    };
                })
                .filter((r) => {
                    if (!prefFilter) return true;
                    if (!r.creatorPrefecture) return false;
                    return r.creatorPrefecture.includes(prefFilter);
                });

            setMatchResults(results);
        } catch (e) {
            console.log("match unknown error:", e);
            setMatchError("マッチング中に予期せぬエラーが発生しました。");
        } finally {
            setMatching(false);
        }
    };

    // ローディング中
    if (loading) {
        return (
            <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
                <p>読み込み中です...</p>
            </main>
        );
    }

    // プロフィール未登録
    if (!profile) {
        return (
            <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
                <h1 className="text-xl font-semibold mb-4">My Page</h1>
                <p>まだプロフィールが登録されていません。</p>
                <Link href="/dashboard" className="text-blue-600 underline">
                    クリエイターダッシュボードでプロフィールを登録する
                </Link>
            </main>
        );
    }

    return (
        <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
            {/* ------------------ 基本情報 ------------------ */}
            <h1 className="text-xl font-semibold mb-4">
                ようこそ、{profile.display_name ?? "ゲスト"} さん
            </h1>

            <section className="mb-8">
                <h2 className="text-lg font-semibold mb-2">あなたの旅のスタイル</h2>
                <p>拠点：{profile.prefecture ?? "未設定"}</p>
                <p>
                    好きなジャンル：
                    {preferredCategory ? preferredCategory.name_ja : "まだ選択されていません"}
                </p>
                <p className="mt-2 text-sm text-gray-600">
                    ※このサービスは、観光地やグルメではなく、
                    <br />
                    「会いに行きたい職人さん」から旅先を決めるためのマッチングサイトです。
                </p>
            </section>

            {/* ------------------ 職人マッチングフォーム ------------------ */}
            <section className="mb-10">
                <h2 className="text-lg font-semibold mb-3">
                    職人とのマッチング検索（ここから旅が始まる）
                </h2>

                {/* ジャンル（カテゴリ） */}
                <div className="mb-3">
                    <label className="block text-sm font-medium mb-1">
                        Category（カテゴリ）
                    </label>
                    <select
                        value={searchCategoryId}
                        onChange={(e) => setSearchCategoryId(e.target.value)}
                        className="border rounded px-2 py-1 w-full max-w-xs"
                    >
                        <option value="">指定なし</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                                {cat.name_ja}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 都道府県 */}
                <div className="mb-3">
                    <label className="block text-sm font-medium mb-1">
                        Where do you go（都道府県）
                    </label>
                    <input
                        type="text"
                        placeholder="例：沖縄 / 京都 / 山梨 など"
                        value={searchPrefecture}
                        onChange={(e) => setSearchPrefecture(e.target.value)}
                        className="border rounded px-2 py-1 w-full max-w-xs"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        ※未入力の場合、日本全国の職人が候補になります。
                    </p>
                </div>

                {/* 種別（体験 or 作品） */}
                <div className="mb-4">
                    <span className="block text-sm font-medium mb-1">
                        探したいもののタイプ
                    </span>
                    <label className="mr-4 text-sm">
                        <input
                            type="radio"
                            name="searchType"
                            value="all"
                            checked={searchType === "all"}
                            onChange={() => setSearchType("all")}
                            className="mr-1"
                        />
                        すべて
                    </label>
                    <label className="mr-4 text-sm">
                        <input
                            type="radio"
                            name="searchType"
                            value="experience"
                            checked={searchType === "experience"}
                            onChange={() => setSearchType("experience")}
                            className="mr-1"
                        />
                        体験プラン（ワークショップ・見学）
                    </label>
                    <label className="text-sm">
                        <input
                            type="radio"
                            name="searchType"
                            value="product"
                            checked={searchType === "product"}
                            onChange={() => setSearchType("product")}
                            className="mr-1"
                        />
                        作品・物販プロダクト
                    </label>
                </div>

                <button
                    onClick={handleMatchSearch}
                    disabled={matching}
                    className="inline-flex items-center px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-60"
                >
                    {matching ? "マッチング中..." : "この条件で職人を探す"}
                </button>

                {matchError && (
                    <p className="mt-2 text-sm text-red-600">{matchError}</p>
                )}
            </section>

            {/* ------------------ マッチング結果一覧 ------------------ */}
            <section className="mb-10">
                <h2 className="text-lg font-semibold mb-3">マッチした職人とプロダクト</h2>

                {!matching && matchResults.length === 0 && (
                    <p className="text-sm text-gray-600">
                        まだ検索が行われていないか、条件に合う職人が見つかりませんでした。
                    </p>
                )}

                {matchResults.length > 0 && (
                    <ul className="space-y-4">
                        {matchResults.map((r) => (
                            <li
                                key={r.productId}
                                className="border rounded-lg px-4 py-3 flex flex-col gap-1"
                            >
                                <div className="text-sm text-gray-600">
                                    会いに行ける職人：
                                    <span className="font-semibold">
                                        {r.creatorName ?? "名前未設定"}
                                    </span>
                                    {r.creatorPrefecture && `（${r.creatorPrefecture}）`}
                                </div>
                                <div>
                                    <div className="text-base font-semibold">{r.productTitle}</div>
                                    <div className="text-sm text-gray-700">
                                        {r.isExperience ? "体験プラン" : "作品・プロダクト"}
                                        {r.priceJpy != null && ` ／ 価格: ¥${r.priceJpy.toLocaleString()}`}
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                                    <Link
                                        href={`/makers/${r.creatorId}`}
                                        className="text-blue-600 underline"
                                    >
                                        この職人のページを見る
                                    </Link>
                                    <Link
                                        href={`/products/${r.productId}`}
                                        className="text-blue-600 underline"
                                    >
                                        この作品／体験の詳細を見る
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ------------------ その他の導線 ------------------ */}
            <section>
                <h2 className="text-lg font-semibold mb-2">ほかの探し方</h2>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>
                        <Link href="/search-products" className="text-blue-600 underline">
                            条件を細かく指定して作品・体験を検索
                        </Link>
                    </li>
                    <li>
                        <Link href="/find-makers" className="text-blue-600 underline">
                            作り手一覧から気になる職人を見つける
                        </Link>
                    </li>
                </ul>
            </section>
        </main>
    );
}
