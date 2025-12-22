// app/subscription/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type DbTarget = "buyer" | "creator" | "bundle";
type UiTab = DbTarget;

type SubscriptionPlan = {
    id: string;
    code: string;
    name: string;
    target: DbTarget;
    monthly_price_jpy: number;
    description: string | null;
    features: string[] | null;
    sort_order: number | null;
};

type UserSubscriptionRow = {
    id: string;
    user_id: string;
    plan_id: string;
    status: "active" | "canceled" | "past_due" | null;
    subscription_plans: SubscriptionPlan | null;
};

const TABS: { key: UiTab; label: string }[] = [
    { key: "buyer", label: "Buyer" },
    { key: "creator", label: "Seller" },
    { key: "bundle", label: "Both" },
];

function asArray<T>(data: unknown): T[] {
    return Array.isArray(data) ? (data as T[]) : [];
}

function jpy(n: number) {
    try {
        return `¥${n.toLocaleString()}`;
    } catch {
        return `¥${n}`;
    }
}

async function getAccessTokenOrThrow() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("not logged in");
    return token;
}

export default function SubscriptionPage() {
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<UiTab>("buyer");
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [currentRows, setCurrentRows] = useState<UserSubscriptionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filteredPlans = useMemo(
        () =>
            plans
                .filter((p) => p.target === activeTab)
                .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
        [plans, activeTab]
    );

    const currentRowForTab = useMemo(() => {
        // このtargetの active / past_due を「現在扱い」
        return (
            currentRows.find(
                (r) =>
                    r.subscription_plans?.target === activeTab &&
                    (r.status === "active" || r.status === "past_due")
            ) ?? null
        );
    }, [currentRows, activeTab]);

    const currentPlan = currentRowForTab?.subscription_plans ?? null;
    const currentStatus = currentRowForTab?.status ?? null;
    const currentPlanId = currentRowForTab?.plan_id ?? null;

    const reload = async () => {
        setLoading(true);
        setError(null);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        // ✅ ログイン必須：未ログインなら /login へ
        if (userError || !user) {
            setLoading(false);
            router.replace(`/login?next=${encodeURIComponent("/subscription")}`);
            return;
        }

        // ① プラン一覧
        const { data: planData, error: planError } = await supabase
            .from("subscription_plans")
            .select(
                "id, code, name, target, monthly_price_jpy, description, features, sort_order"
            )
            .order("target", { ascending: true })
            .order("sort_order", { ascending: true });

        if (planError) {
            console.error("planError", planError);
            setError(
                `サブスクプランの取得に失敗しました。${planError.message ? `（${planError.message}）` : ""
                }`
            );
            setLoading(false);
            return;
        }
        setPlans(asArray<SubscriptionPlan>(planData));

        // ② 現在のサブスク（JOIN）
        const { data: subData, error: subError } = await supabase
            .from("user_subscriptions")
            .select(
                `
          id,
          user_id,
          plan_id,
          status,
          subscription_plans (
            id, code, name, target, monthly_price_jpy, description, features, sort_order
          )
        `
            )
            .eq("user_id", user.id);

        if (subError) {
            console.error("subError", subError);
            setError(
                `現在のサブスク情報の取得に失敗しました。${subError.message ? `（${subError.message}）` : ""
                }`
            );
            setLoading(false);
            return;
        }

        setCurrentRows(asArray<UserSubscriptionRow>(subData));
        setLoading(false);
    };

    useEffect(() => {
        void reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ Portalを開く：accessTokenは body じゃなく Authorization で送る
    const openBillingPortal = async () => {
        if (saving) return;
        setSaving(true);
        setError(null);

        try {
            const accessToken = await getAccessTokenOrThrow();

            const res = await fetch("/api/stripe/portal", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ returnPath: "/subscription" }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.url) {
                throw new Error(json.error || `failed to open portal (${res.status})`);
            }

            window.location.href = json.url as string;
        } catch (e: any) {
            console.error("openBillingPortal error", e);
            setError(`決済管理画面を開けませんでした。（${e?.message ?? "unknown"}）`);
            setSaving(false);
            return;
        }

        setSaving(false);
    };

    // ✅ Checkout：accessTokenは body じゃなく Authorization で送る
    const startCheckoutOrPortal = async (plan: SubscriptionPlan) => {
        if (saving) return;
        setSaving(true);
        setError(null);

        try {
            const accessToken = await getAccessTokenOrThrow();

            const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ planId: plan.id, returnPath: "/subscription" }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.url) {
                throw new Error(json.error || `failed to create checkout (${res.status})`);
            }

            window.location.href = json.url as string;
        } catch (e: any) {
            console.error("startCheckoutOrPortal error", e);
            setError(`購入/変更を開始できませんでした。（${e?.message ?? "unknown"}）`);
            setSaving(false);
            return;
        }

        setSaving(false);
    };

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <header className="mb-8 space-y-2">
                <h1 className="text-4xl font-extrabold tracking-tight">Subscription</h1>
                <p className="text-sm text-gray-600">
                    Buyer / Seller / Both を切り替えて、プランを選択します。
                </p>

                {/* 現在プラン（タブごと） */}
                <div className="pt-3 text-sm">
                    {currentPlan ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border px-3 py-1 text-xs font-semibold">
                                Current ({activeTab})
                            </span>
                            <span className="font-semibold">{currentPlan.name}</span>
                            <span className="text-gray-600">{jpy(currentPlan.monthly_price_jpy)}/月</span>

                            {currentStatus === "past_due" && (
                                <span className="rounded-full border border-black bg-white px-3 py-1 text-xs font-semibold text-black">
                                    Past due
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="text-gray-600">Current ({activeTab}): 未選択</div>
                    )}
                </div>
            </header>

            {/* ✅ past_due 導線 */}
            {currentStatus === "past_due" && (
                <div className="mb-6 rounded-xl border border-black bg-white px-4 py-3 text-sm text-black">
                    <div className="font-semibold">支払いが「past_due」になっています。</div>
                    <div className="mt-1 text-gray-700">
                        決済方法を更新してから、必要ならプランを切り替えてください。
                    </div>
                    <div className="mt-3">
                        <button
                            disabled={saving}
                            onClick={openBillingPortal}
                            className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                        >
                            決済方法を更新
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* タブ */}
            <div className="mb-8 flex flex-wrap gap-4">
                {TABS.map((t) => {
                    const active = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={[
                                "rounded-full border px-5 py-2 text-sm font-semibold transition",
                                active
                                    ? "border-black bg-black text-white"
                                    : "border-gray-300 bg-white text-gray-900 hover:border-gray-500",
                            ].join(" ")}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <p className="text-sm text-gray-600">読み込み中...</p>
            ) : filteredPlans.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <p className="text-sm text-gray-700">このカテゴリのプランはまだ準備中です。</p>
                    <p className="mt-2 text-xs text-gray-500">
                        ※ DB の subscription_plans に該当 target（{activeTab}）の行が無いとここになります。
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2">
                    {filteredPlans.map((plan) => {
                        const isSamePlan = currentPlanId === plan.id;
                        const isActive = isSamePlan && currentStatus === "active";
                        const isPastDue = isSamePlan && currentStatus === "past_due";

                        const hasLiveSubscriptionInTab =
                            currentStatus === "active" || currentStatus === "past_due";

                        const willGoPortal = hasLiveSubscriptionInTab && !isSamePlan;

                        return (
                            <div
                                key={plan.id}
                                className={[
                                    "rounded-2xl border bg-white p-6 shadow-sm",
                                    isSamePlan ? "border-black ring-1 ring-black" : "border-gray-200",
                                ].join(" ")}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold">{plan.name}</h2>
                                        <p className="mt-1 text-xs text-gray-500">code: {plan.code}</p>
                                    </div>

                                    {isActive && (
                                        <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
                                            Current
                                        </span>
                                    )}
                                    {isPastDue && (
                                        <span className="rounded-full border border-black bg-white px-3 py-1 text-xs font-semibold text-black">
                                            Past due
                                        </span>
                                    )}
                                </div>

                                <div className="mt-4 text-3xl font-extrabold">
                                    {jpy(plan.monthly_price_jpy)}
                                    <span className="ml-1 text-base font-semibold text-gray-500">/ 月</span>
                                </div>

                                {plan.description && (
                                    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                                        {plan.description}
                                    </div>
                                )}

                                {plan.features && plan.features.length > 0 && (
                                    <ul className="mt-4 space-y-2 text-sm text-gray-700">
                                        {plan.features.map((f, idx) => (
                                            <li key={idx} className="flex gap-2">
                                                <span className="mt-[2px] inline-block h-4 w-4 rounded-full border border-gray-300" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <button
                                    disabled={saving || isActive}
                                    onClick={() => startCheckoutOrPortal(plan)}
                                    className={[
                                        "mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold transition",
                                        isActive ? "cursor-default bg-gray-200 text-gray-700" : "bg-black text-white hover:opacity-90",
                                        saving ? "opacity-60" : "",
                                    ].join(" ")}
                                >
                                    {isActive
                                        ? "現在のプラン"
                                        : isPastDue
                                            ? "このプランを再開（Checkout/Portalへ）"
                                            : willGoPortal
                                                ? "プラン変更（決済管理へ）"
                                                : "このプランを購入"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
