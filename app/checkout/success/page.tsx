"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

async function getAccessTokenOrThrow() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("not logged in");
    return token;
}

export default function CheckoutSuccessPage() {
    const router = useRouter();
    const sp = useSearchParams();
    const sessionId = useMemo(() => sp.get("session_id"), [sp]);

    const [status, setStatus] = useState<"waiting" | "done" | "error">("waiting");
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId) {
            setStatus("error");
            setErr("missing session_id");
            return;
        }

        let cancelled = false;

        const run = async () => {
            setStatus("waiting");
            setErr(null);

            try {
                const token = await getAccessTokenOrThrow();

                // 最大 ~30秒待つ（2s×15回）
                for (let i = 0; i < 15; i++) {
                    if (cancelled) return;

                    const res = await fetch(`/api/orders/by-session?session_id=${encodeURIComponent(sessionId)}`, {
                        method: "GET",
                        headers: { Authorization: `Bearer ${token}` },
                        cache: "no-store",
                    });

                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json?.error || `failed (${res.status})`);

                    const order = json?.order ?? null;
                    if (order?.id) {
                        setStatus("done");
                        router.replace(`/orders/${order.id}`);
                        return;
                    }

                    await new Promise((r) => setTimeout(r, 2000));
                }

                // タイムアウト：注文一覧へ誘導
                setStatus("error");
                setErr("注文確定に時間がかかっています。Orders から確認してください。");
            } catch (e: any) {
                console.error("checkout success polling error:", e);
                setStatus("error");
                setErr(e?.message ?? "failed");
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [router, sessionId]);

    return (
        <main className="mx-auto max-w-xl px-4 py-12 space-y-6">
            <h1 className="text-3xl font-extrabold tracking-tight">Payment Completed</h1>

            {status === "waiting" ? (
                <div className="rounded-2xl border bg-white p-6 space-y-2">
                    <div className="font-bold">注文を確定中...</div>
                    <p className="text-sm text-gray-600">
                        webhook で注文作成中です。数秒〜十数秒かかることがあります。
                    </p>
                    <p className="text-xs text-gray-500">session_id: {sessionId}</p>
                </div>
            ) : status === "error" ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-6 space-y-3">
                    <div className="font-bold text-red-700">うまく確定できませんでした</div>
                    <div className="text-sm text-red-700">{err ?? "unknown error"}</div>
                    <div className="flex gap-2">
                        <Link
                            href="/orders"
                            className="rounded-xl bg-black px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"
                        >
                            Ordersへ
                        </Link>
                        <Link
                            href="/cart"
                            className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:border-gray-500"
                        >
                            Cartへ
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border bg-white p-6">
                    Redirecting...
                </div>
            )}
        </main>
    );
}
