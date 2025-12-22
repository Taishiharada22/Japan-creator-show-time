"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Profile = {
    id: string;
    display_name_ja: string | null;
    display_name_en: string | null;
    prefecture: string | null;
    city: string | null;
};

type Product = {
    id: string;
    title_ja: string | null;
    price_jpy: number | null;
};

type SubscriptionPlanMini = {
    target: "buyer" | "creator" | "bundle" | null;
    name: string | null;
};

type SubscriptionRow = {
    plan_id: string;
    status: string | null;
    subscription_plans: SubscriptionPlanMini | null;
};

function asArray<T>(data: unknown): T[] {
    return Array.isArray(data) ? (data as T[]) : [];
}

export default function CreatorDashboardPage() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [hasCreatorAccess, setHasCreatorAccess] = useState(false);
    const [currentPlanName, setCurrentPlanName] = useState<string | null>(null);

    const [profile, setProfile] = useState<Profile | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
                console.warn("auth getUser error", userError);
                setError("ログイン情報の取得中にエラーが発生しました。");
                setLoading(false);
                return;
            }

            if (!user) {
                router.push("/login?next=/dashboard");
                return;
            }

            // 1) サブスク状態（plan.target は JOIN 側から取る。user_subscriptions.target は存在しない）
            const { data: subData, error: subError } = await supabase
                .from("user_subscriptions")
                .select("plan_id, status, subscription_plans (target, name)")
                .eq("user_id", user.id)
                .eq("status", "active");

            if (subError) {
                console.warn("user_subscriptions load error", subError);
                setError("サブスク情報の取得中にエラーが発生しました。");
                setLoading(false);
                return;
            }

            const rows = asArray<SubscriptionRow>(subData);

            // creator or bundle を作り手アクセス扱い
            let creatorAccess = false;
            let planName: string | null = null;

            for (const row of rows) {
                const plan = row.subscription_plans;
                if (!plan) continue;
                if (plan.target === "creator" || plan.target === "bundle") {
                    creatorAccess = true;
                    if (!planName && plan.name) planName = plan.name;
                }
            }

            setHasCreatorAccess(creatorAccess);
            setCurrentPlanName(planName);

            if (!creatorAccess) {
                setLoading(false);
                return;
            }

            // 2) プロフィール
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("id, display_name_ja, display_name_en, prefecture, city")
                .eq("id", user.id)
                .maybeSingle();

            if (profileError) {
                console.warn("profiles load error", profileError);
                setError("プロフィール情報の取得中にエラーが発生しました。");
                setLoading(false);
                return;
            }

            setProfile(profileData as Profile);

            // 3) 自分の商品一覧
            const { data: productData, error: productError } = await supabase
                .from("products")
                .select("id, title_ja, price_jpy")
                .eq("creator_id", user.id)
                .order("created_at", { ascending: false });

            if (productError) {
                console.warn("products load error", productError);
                setError("商品の取得中にエラーが発生しました。");
                setLoading(false);
                return;
            }

            setProducts(asArray<Product>(productData));
            setLoading(false);
        };

        load();
    }, [router]);

    if (loading) {
        return (
            <main className="mx-auto max-w-5xl px-4 py-10">
                <p className="text-sm text-gray-600">読み込み中...</p>
            </main>
        );
    }

    if (!hasCreatorAccess) {
        return (
            <main className="mx-auto max-w-xl px-4 py-10">
                <h1 className="text-3xl font-extrabold tracking-tight">Creator Dashboard</h1>
                <p className="mt-3 text-sm text-gray-700">
                    まだ「作り手向け」のサブスクプランが有効になっていません。
                </p>
                <p className="mt-2 text-sm text-gray-600">
                    出店（作品・体験の登録）をするには <b>Seller</b> もしくは <b>Both</b> を選択してください。
                </p>

                {error && (
                    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="mt-6">
                    <Link
                        href="/subscription"
                        className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-bold text-white hover:opacity-90"
                    >
                        サブスクプランを選ぶ（Seller / Both）
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight">Creator Dashboard</h1>
                <p className="mt-2 text-sm text-gray-600">あなたの作品・体験を管理する画面です。</p>
                {currentPlanName && (
                    <p className="mt-2 text-xs text-gray-500">
                        現在のプラン：<b>{currentPlanName}</b>
                    </p>
                )}
            </header>

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {profile && (
                <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-bold">あなたのプロフィール</h2>
                    <p className="mt-2 text-base font-semibold">
                        {profile.display_name_ja || profile.display_name_en || "名前未設定"}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                        {profile.prefecture || ""} {profile.city || ""}
                    </p>
                    <div className="mt-4">
                        <Link href="/my" className="text-sm font-semibold text-blue-600 underline">
                            プロフィールを編集する（My Pageへ）
                        </Link>
                    </div>
                </section>
            )}

            <section className="mb-8">
                <Link
                    href="/products/new"
                    className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-bold text-white hover:opacity-90"
                >
                    新しい作品・体験を登録する
                </Link>
            </section>

            <section>
                <h2 className="text-lg font-bold">登録済みの作品・体験</h2>

                {products.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600">
                        まだ作品・体験は登録されていません。<br />
                        「新しい作品・体験を登録する」から最初の1件を登録してみましょう。
                    </p>
                ) : (
                    <ul className="mt-4 space-y-3">
                        {products.map((p) => (
                            <li
                                key={p.id}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                            >
                                <div>
                                    <div className="text-base font-semibold">
                                        {p.title_ja || "タイトル未設定"}
                                    </div>
                                    <div className="mt-1 text-sm text-gray-600">
                                        {p.price_jpy !== null ? `¥${p.price_jpy.toLocaleString()}` : "価格未設定"}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 text-sm font-semibold">
                                    <Link href={`/products/${p.id}`} className="text-blue-600 underline">
                                        詳細
                                    </Link>
                                    <Link href={`/products/${p.id}/edit`} className="text-purple-700 underline">
                                        編集
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
