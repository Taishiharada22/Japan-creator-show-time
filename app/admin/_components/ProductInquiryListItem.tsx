// app/admin/_components/ProductInquiryListItem.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { quickUpdateProductInquiryStatus } from "@/app/admin/_actions/quickStatus";

type Row = {
    id: string;
    created_at: string;
    updated_at?: string | null;
    product_id: string;
    status: string;
    name: string;
    email: string;
    message: string;
    internal_note: string | null;
    products?: { title_ja: string | null } | { title_ja: string | null }[] | null;
};

function fmt(d: string) {
    try {
        return new Date(d).toLocaleString("ja-JP");
    } catch {
        return d;
    }
}

function statusBadge(status: string) {
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs";
    if (status === "new") return `${base} bg-red-50 text-red-700 border-red-200`;
    if (status === "in_progress") return `${base} bg-yellow-50 text-yellow-800 border-yellow-200`;
    if (status === "done") return `${base} bg-green-50 text-green-700 border-green-200`;
    return `${base} bg-gray-50 text-gray-700 border-gray-200`;
}

export default function ProductInquiryListItem({ r }: { r: Row }) {
    const router = useRouter();
    const sp = useSearchParams();

    // 一覧のstatusフィルタ（無いなら new がデフォ）
    const currentFilter = sp.get("status") ?? "new";

    const [status, setStatus] = useState(r.status);
    const [hidden, setHidden] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    if (hidden) return null;

    const productTitle = Array.isArray(r.products)
        ? r.products[0]?.title_ja ?? null
        : (r.products as any)?.title_ja ?? null;

    const hasNote = !!(r.internal_note ?? "").trim();
    const when = fmt((r.updated_at ?? r.created_at) as string);

    // フィルタ中は「次statusがフィルタと違う」なら即行を消す（new一覧で着手→消える等）
    const shouldHideOn = (nextStatus: string) => {
        if (currentFilter === "all") return false; // all表示の時は消さない
        return nextStatus !== currentFilter;
    };

    async function doUpdate(nextStatus: "in_progress" | "done") {
        if (saving) return;
        setErr(null);

        const prev = status;
        setSaving(true);

        // ✅ 先に見た目を更新（optimistic）
        setStatus(nextStatus);
        if (shouldHideOn(nextStatus)) setHidden(true);

        const fd = new FormData();
        fd.set("id", r.id);
        fd.set("status", nextStatus);

        try {
            // ✅ quickUpdateProductInquiryStatus は Promise<void>（戻り値なし）
            await quickUpdateProductInquiryStatus(fd);
            router.refresh(); // ✅ 裏データも同期
        } catch (e: any) {
            // 失敗したら戻す
            setHidden(false);
            setStatus(prev);
            setErr(e?.message ?? "更新に失敗しました");
        } finally {
            setSaving(false);
        }
    }

    return (
        <li className="px-4 py-3">
            <div className="hover:bg-gray-50 rounded-xl px-2 py-2 flex gap-3 items-start justify-between">
                <Link href={`/admin/inquiries/${r.id}`} className="min-w-0 flex-1 block">
                    <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-2 text-xs text-gray-600">{when}</div>
                        <div className="col-span-2">
                            <span className={statusBadge(status)}>{status}</span>
                        </div>
                        <div className="col-span-3">
                            <div className="text-sm font-semibold">{r.name}</div>
                            <div className="text-xs text-gray-600">{r.email}</div>
                        </div>
                        <div className="col-span-4">
                            <div className="text-sm">{productTitle ?? r.product_id}</div>
                            <div className="text-xs text-gray-500 truncate">{r.message}</div>
                        </div>
                        <div className="col-span-1 text-right text-xs">{hasNote ? "📝" : "—"}</div>
                    </div>
                    {err && <div className="mt-2 text-xs text-red-700">{err}</div>}
                </Link>

                <div className="w-16 flex justify-end">
                    <div className="shrink-0 flex flex-col gap-2">
                        {status === "new" && (
                            <button
                                disabled={saving}
                                onClick={() => void doUpdate("in_progress")}
                                className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
                            >
                                {saving ? "…" : "着手"}
                            </button>
                        )}
                        {status === "in_progress" && (
                            <button
                                disabled={saving}
                                onClick={() => void doUpdate("done")}
                                className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-60"
                            >
                                {saving ? "…" : "完了"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
}
