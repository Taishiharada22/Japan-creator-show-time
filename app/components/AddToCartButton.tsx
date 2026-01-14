"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

async function getAccessTokenOrThrow() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("not logged in");
    return token;
}

export default function AddToCartButton({
    productId,
    qty = 1,
}: {
    productId: string;
    qty?: number;
}) {
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const add = async () => {
        if (saving) return;
        setSaving(true);
        setMsg(null);

        try {
            const token = await getAccessTokenOrThrow();

            const res = await fetch("/api/cart", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ op: "add", productId, quantity: qty }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || `failed (${res.status})`);

            setMsg("Added!");
            setTimeout(() => setMsg(null), 1200);
        } catch (e: any) {
            console.error("addToCart error:", e);
            setMsg(e?.message ?? "failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <button
            onClick={add}
            disabled={saving}
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
            {saving ? "Adding..." : msg ?? "Add to cart"}
        </button>
    );
}
