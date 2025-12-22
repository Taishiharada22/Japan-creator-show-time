// app/admin/_components/SiteInquiryListItem.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { quickUpdateSiteInquiryStatus } from "@/app/admin/_actions/quickStatus";

type Row = {
    id: string;
    created_at: string;
    updated_at?: string | null;
    status: string;
    name: string;
    email: string;
    source_path: string | null;
    message: string;
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

function readStatusFilterFromLocation(): string {
    if (typeof window === "undefined") return "new";
    const sp = new URLSearchParams(window.location.search);
    return sp.get("status") ?? "new";
}

export default function SiteInquiryListItem({ r }: { r: Row }) {
    const router = useRouter();

    // ✅ useSearchParams を使わず、URLから読む（missing-suspense回避）
    const [currentFilter, setCurrentFilter] = useState<string>("new");

    const [status, setStatus] = useState(r.status);
    const [hidden, setHidden] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // ✅ 初回 & 戻る/進む（popstate）でフィルタを更新
    useEffect(() => {
        const sync = () => setCurrentFilter(readStatusFilterFromLocation());
        sync();

        const onPopState = () => sync();
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    if (hidden) return null;

    const when = fmt((r.updated_at ?? r.created_at) as string);

    const shouldHideOn = (nextStatus: string) => {
        if (currentFilter === "all") return false;
        return nextStatus !== currentFilter;
    };

    async function doUpdate(nextStatus: "in_progress" | "done") {
        if (saving) return;
        setErr(null);

        const prev = status;
        setSaving(true);

        // ✅ optimistic update
        setStatus(nextStatus);
        if (shouldHideOn(nextStatus)) setHidden(true);

        const fd = new FormData();
        fd.set("id", r.id);
        fd.set("status", nextStatus);

        try {
            // ✅ quickUpdateSiteInquiryStatus は Promise<void>
            await quickUpdateSiteInquiryStatus(fd);
            router.refresh();
        } catch (e: any) {
            // 失敗したら戻す
            setHidden(false);
            setStatus(prev);
            setErr(e?.message ?? "更新に失敗しました");
        } finally {
            setSaving(false);
        }
    }

    // ✅ /undefined へ飛ばない保険（念のため）
    const safeId = (r.id ?? "").toString().trim();
    const detailHref = safeId ? `/admin/site-inquiries/${safeId}` : "/admin/site-inquiries";

    return (
        <li className="px-4 py-3">
            <div className="hover:bg-gray-50 rounded-xl px-2 py-2 flex gap-3 items-start justify-between">
                <Link href={detailHref} className="min-w-0 flex-1 block">
                    <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-2 text-xs text-gray-600">{when}</div>
                        <div className="col-span-2">
                            <span className={statusBadge(status)}>{status}</span>
                        </div>
                        <div className="col-span-3">
                            <div className="text-sm font-semibold">{r.name}</div>
                            <div className="text-xs text-gray-600">{r.email}</div>
                        </div>
                        <div className="col-span-2 text-xs text-gray-600 truncate">{r.source_path ?? "-"}</div>
                        <div className="col-span-3 text-xs text-gray-500 truncate">{r.message}</div>
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
