"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

async function getAccessTokenOrNull() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
}

export default function AddToCart({ productId }: { productId: string }) {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const add = async () => {
        if (loading) return;
        setLoading(true);
        setErr(null);
        setDone(false);

        try {
            const token = await getAccessTokenOrNull();
            if (!token) throw new Error("not logged in");

            const res = await fetch("/api/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ op: "add", productId, quantity: 1 }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || `failed (${res.status})`);

            setDone(true);
        } catch (e: any) {
            console.error("add to cart error:", e);
            setErr(e?.message ?? "failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3">
            {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
            )}

            {done && (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    カートに追加しました ✅{" "}
                    <Link href="/cart" className="font-bold underline">
                        Cartへ
                    </Link>
                </div>
            )}

            <button
                onClick={add}
                disabled={loading}
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-extrabold text-white hover:opacity-90 disabled:opacity-60"
            >
                {loading ? "Adding..." : "Add to cart"}
            </button>

            <div className="text-xs text-gray-500">
                ※ ログインしてない場合はエラーになります（/login でログイン）
            </div>
        </div>
    );
}
