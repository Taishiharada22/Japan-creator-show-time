// app/login/LoginForm.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginForm({ redirectTo }: { redirectTo: string }) {
    const router = useRouter();

    const supabase = useMemo(() => supabaseBrowser(), []);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [err, setErr] = useState("");

    return (
        <main className="max-w-md mx-auto px-4 py-14 space-y-6">
            <h1 className="text-2xl font-bold">Admin Login</h1>

            <form
                className="rounded-2xl border bg-white p-6 space-y-4"
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (pending) return;

                    setErr("");
                    setPending(true);

                    const { error } = await supabase.auth.signInWithPassword({
                        email,
                        password,
                    });

                    setPending(false);

                    if (error) {
                        setErr(error.message);
                        return;
                    }

                    router.push(redirectTo);
                    router.refresh();
                }}
            >
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Email</label>
                    <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@example.com"
                        required
                        autoComplete="email"
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-600 mb-1">Password</label>
                    <input
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                </div>

                {err && (
                    <div className="rounded-xl border p-3 bg-red-50 text-sm text-red-700">
                        {err}
                    </div>
                )}

                <button
                    className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                    disabled={pending}
                >
                    {pending ? "Signing in..." : "Sign in"}
                </button>

                <p className="text-xs text-gray-500">※ admin権限が無いと /admin には入れません</p>
            </form>
        </main>
    );
}
