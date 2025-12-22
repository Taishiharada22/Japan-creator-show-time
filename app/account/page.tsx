// app/account/page.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function AccountPage() {
    const router = useRouter();
    const pathname = usePathname();

    const [session, setSession] = useState<Session | null>(null);
    const [checking, setChecking] = useState(true);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;

        (async () => {
            const { data } = await supabase.auth.getSession();
            const s = data.session ?? null;

            if (!mounted) return;

            if (!s) {
                router.replace(`/login?next=${encodeURIComponent(pathname || "/account")}`);
                return;
            }

            setSession(s);
            setChecking(false);
        })();

        const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
            if (!newSession) {
                router.replace(`/login?next=${encodeURIComponent(pathname || "/account")}`);
            } else {
                setSession(newSession);
            }
        });

        return () => {
            mounted = false;
            sub.subscription.unsubscribe();
        };
    }, [router, pathname]);

    if (checking) {
        return (
            <main className="mx-auto max-w-3xl p-6">
                <div className="rounded-lg border p-4 text-sm text-neutral-600">確認中...</div>
            </main>
        );
    }

    const openPortal = async () => {
        if (busy) return;
        setBusy(true);

        try {
            const token = session?.access_token;
            if (!token) {
                router.replace(`/login?next=${encodeURIComponent(pathname || "/account")}`);
                return;
            }

            const res = await fetch("/api/billing-portal", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });

            const text = await res.text();
            let json: any = null;
            try {
                json = JSON.parse(text);
            } catch { }

            if (!res.ok) {
                alert(json?.error ?? text ?? `billing portal failed (${res.status})`);
                return;
            }

            const url = json?.url;
            if (!url) {
                alert(json?.error ?? "billing portal url is missing");
                return;
            }

            window.location.href = url;
        } finally {
            setBusy(false);
        }
    };

    const logout = async () => {
        await supabase.auth.signOut();
        router.replace("/login");
    };

    return (
        <main className="mx-auto max-w-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">アカウント</h1>

                <button onClick={logout} className="rounded-md border px-4 py-2 text-sm" type="button">
                    ログアウト
                </button>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm text-neutral-600">
                    サブスクのプラン変更・支払い方法の更新・領収書確認・解約はStripeの管理画面で行えます。
                </p>

                <button
                    onClick={openPortal}
                    className="rounded-md border px-4 py-2 disabled:opacity-60"
                    type="button"
                    disabled={busy}
                >
                    {busy ? "開いています..." : "請求情報を管理"}
                </button>
            </div>
        </main>
    );
}
