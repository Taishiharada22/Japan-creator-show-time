"use client";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function BillingPortalButton() {
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
            alert(json.error ?? "failed");
            return;
        }

        window.location.href = json.url;
    };

    return (
        <button
            onClick={openPortal}
            className="rounded-md border px-4 py-2"
            type="button"
        >
            請求情報を管理
        </button>
    );
}
