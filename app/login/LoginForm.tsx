// app/login/LoginForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginForm({ nextPath }: { nextPath: string }) {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;

            router.replace(nextPath);
            router.refresh();
        } catch (err: any) {
            console.error("login error:", err);
            setError(err?.message ?? "login failed");
            setLoading(false);
            return;
        }

        setLoading(false);
    };

    return (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-white p-5">
            <div className="space-y-1">
                <label className="text-sm font-semibold">Email</label>
                <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                />
            </div>

            <div className="space-y-1">
                <label className="text-sm font-semibold">Password</label>
                <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    type="password"
                />
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
                {loading ? "ログイン中..." : "ログイン"}
            </button>
        </form>
    );
}
