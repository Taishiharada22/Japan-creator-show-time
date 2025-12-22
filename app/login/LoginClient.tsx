// app/login/LoginClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginClient({ nextPath }: { nextPath: string }) {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;

        setSaving(true);
        setError(null);

        try {
            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInErr) throw signInErr;

            router.replace(nextPath);
            router.refresh();
        } catch (err: any) {
            console.error("login error:", err);
            setError(err?.message ?? "login failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-extrabold">Login</h1>
            <p className="mt-2 text-sm text-gray-600">
                ログイン後、{nextPath} に戻します。
            </p>

            {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <form onSubmit={onLogin} className="mt-6 space-y-3">
                <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                />
                <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                />

                <button
                    disabled={saving}
                    className="w-full rounded-xl bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                >
                    {saving ? "Signing in..." : "Sign in"}
                </button>
            </form>
        </div>
    );
}
