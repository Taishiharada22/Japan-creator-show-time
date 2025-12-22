// app/subscription/SubscriptionClient.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Plan = {
    id: string;
    code: string;
    name: string;
    target: string; // "creator" or "buyer"
    monthly_price_jpy: number | null;
    description: string | null;
    features: string[] | null;
};

type Props = {
    creatorPlans: Plan[];
    buyerPlans: Plan[];
};

export default function SubscriptionClient({
    creatorPlans,
    buyerPlans,
}: Props) {
    const [activeTab, setActiveTab] = useState<"creator" | "buyer">("creator");
    const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
    const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const router = useRouter();

    // ログイン中ユーザーの「現在のプラン」を読み込む
    useEffect(() => {
        const loadCurrentSubscription = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) return; // 未ログインなら何もしない

            const { data, error } = await supabase
                .from("user_subscriptions")
                .select("plan_id, status")
                .eq("user_id", user.id)
                .eq("status", "active")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error("loadCurrentSubscription error", error);
                return;
            }

            if (data?.plan_id) {
                setCurrentPlanId(data.plan_id);
            }
        };

        loadCurrentSubscription();
    }, []);

    // プラン選択処理（user_subscriptions に INSERT）
    const handleSelectPlan = async (plan: Plan) => {
        setMessage(null);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            // ログインしていなければログインページへ
            router.push(`/login?next=/subscription`);
            return;
        }

        try {
            setLoadingPlanId(plan.id);

            const { error } = await supabase.from("user_subscriptions").insert({
                user_id: user.id,
                plan_id: plan.id,
                status: "active",
            });

            if (error) {
                console.error("changePlan error", error);
                setMessage(
                    "プラン変更中にエラーが発生しました。時間をおいて再度お試しください。"
                );
                return;
            }

            setCurrentPlanId(plan.id);
            setMessage(`「${plan.name}」プランを選択しました。`);
        } finally {
            setLoadingPlanId(null);
        }
    };

    const activePlans = activeTab === "creator" ? creatorPlans : buyerPlans;

    return (
        <section style={{ marginTop: 24 }}>
            {/* タブ切り替え */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <button
                    type="button"
                    onClick={() => setActiveTab("creator")}
                    style={{
                        padding: "8px 16px",
                        borderRadius: 9999,
                        border: "1px solid #ccc",
                        background: activeTab === "creator" ? "#111" : "#fff",
                        color: activeTab === "creator" ? "#fff" : "#111",
                        cursor: "pointer",
                    }}
                >
                    作り手向けプラン
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("buyer")}
                    style={{
                        padding: "8px 16px",
                        borderRadius: 9999,
                        border: "1px solid #ccc",
                        background: activeTab === "buyer" ? "#111" : "#fff",
                        color: activeTab === "buyer" ? "#fff" : "#111",
                        cursor: "pointer",
                    }}
                >
                    買い手向けプラン
                </button>
            </div>

            {/* メッセージ表示 */}
            {message && (
                <p style={{ marginBottom: 12, color: "#16a34a", fontSize: 14 }}>
                    {message}
                </p>
            )}

            {/* プランカード一覧 */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 16,
                }}
            >
                {activePlans.map((plan) => {
                    const isCurrent = plan.id === currentPlanId;

                    return (
                        <div
                            key={plan.id}
                            style={{
                                borderRadius: 16,
                                border: "1px solid #e5e5e5",
                                padding: 20,
                                background: isCurrent ? "#f4f4ff" : "#fff",
                            }}
                        >
                            <h2
                                style={{
                                    fontSize: 18,
                                    fontWeight: 600,
                                    marginBottom: 4,
                                }}
                            >
                                {plan.name}
                            </h2>
                            <p
                                style={{
                                    fontSize: 12,
                                    color: "#666",
                                    marginBottom: 8,
                                }}
                            >
                                コード: {plan.code}
                            </p>

                            {plan.monthly_price_jpy !== null ? (
                                <p
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        marginBottom: 8,
                                    }}
                                >
                                    ￥{plan.monthly_price_jpy.toLocaleString()} / 月
                                </p>
                            ) : (
                                <p
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        marginBottom: 8,
                                    }}
                                >
                                    価格は調整中
                                </p>
                            )}

                            {plan.description && (
                                <p
                                    style={{
                                        fontSize: 14,
                                        marginBottom: 8,
                                    }}
                                >
                                    {plan.description}
                                </p>
                            )}

                            {Array.isArray(plan.features) && plan.features.length > 0 && (
                                <ul
                                    style={{
                                        fontSize: 13,
                                        color: "#444",
                                        marginBottom: 12,
                                        paddingLeft: 16,
                                    }}
                                >
                                    {plan.features.map((feat) => (
                                        <li key={feat}>・{feat}</li>
                                    ))}
                                </ul>
                            )}

                            <button
                                type="button"
                                onClick={() => handleSelectPlan(plan)}
                                disabled={loadingPlanId === plan.id}
                                style={{
                                    marginTop: 4,
                                    width: "100%",
                                    padding: "10px 16px",
                                    borderRadius: 9999,
                                    border: "none",
                                    background: isCurrent ? "#9ca3af" : "#111827",
                                    color: "#fff",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                {loadingPlanId === plan.id
                                    ? "保存中..."
                                    : isCurrent
                                        ? "現在のプラン"
                                        : "このプランにする"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
