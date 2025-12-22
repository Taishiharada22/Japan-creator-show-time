"use client";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AccountPage() {
    const openPortal = async () => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        if (!token) {
            alert("ログインしてください");
            return;
        }

        const res = await fetch("/api/billing-portal", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json();
        if (!res.ok) {
            alert(json.error ?? "billing portal failed");
            return;
        }

        window.location.href = json.url;
    };

    return (
        <main className="mx-auto max-w-3xl p-6 space-y-4">
            <h1 className="text-xl font-semibold">アカウント</h1>

            <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm text-neutral-600">
                    サブスクのプラン変更・支払い方法の更新・領収書確認・解約はStripeの管理画面で行えます。
                </p>

                <button
                    onClick={openPortal}
                    className="rounded-md border px-4 py-2"
                    type="button"
                >
                    請求情報を管理
                </button>
            </div>
        </main>
    );
}
