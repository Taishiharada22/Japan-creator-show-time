// app/admin/site-inquiries/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import StatusEditor from "./ui";

export const dynamic = "force-dynamic";

function isUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function fmtJST(v: string) {
    const d = new Date(v);
    return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default async function AdminSiteInquiryDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    // ✅ undefined / uuidじゃない値はDBに投げない
    if (!id || id === "undefined" || !isUuid(id)) return notFound();

    const { data, error } = await supabaseAdmin
        .from("site_inquiries")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        return (
            <main className="max-w-5xl mx-auto px-4 py-10 space-y-3">
                <h1 className="text-2xl font-bold">運営お問い合わせ（詳細）</h1>
                <p className="text-sm text-red-700">取得エラー: {error.message}</p>
                <Link className="text-sm underline" href="/admin/site-inquiries">
                    一覧へ戻る
                </Link>
            </main>
        );
    }

    if (!data) return notFound();

    const sourcePath =
        (data.source_path as string | null) ??
        (data.meta?.source_path as string | null) ??
        "-";

    const metaPretty = data.meta ? JSON.stringify(data.meta, null, 2) : "";

    return (
        <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">運営お問い合わせ（詳細）</h1>
                    <p className="text-sm text-gray-600">
                        LeadID: <span className="font-mono">{data.id}</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link className="text-sm underline" href="/admin/site-inquiries">
                        一覧へ戻る
                    </Link>
                    <Link className="text-sm underline" href="/admin">
                        管理トップ
                    </Link>
                </div>
            </div>

            {/* お問い合わせ本体 */}
            <section className="rounded-2xl border bg-white p-5 space-y-3">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <div className="text-xs text-gray-500">作成日時</div>
                        <div className="font-semibold">{fmtJST(data.created_at)}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">ステータス</div>
                        <div className="font-semibold">{data.status}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">お客様</div>
                        <div className="font-semibold">{data.name ?? "(未入力)"}</div>
                        <div className="text-xs text-gray-600">{data.email ?? "(未入力)"}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">送信元</div>
                        <div className="font-mono text-xs break-all">{sourcePath}</div>
                    </div>
                </div>

                <div className="pt-3">
                    <div className="text-xs text-gray-500 mb-1">内容</div>
                    <pre className="whitespace-pre-wrap text-sm leading-6 rounded-xl border bg-gray-50 p-4">
                        {data.message}
                    </pre>
                </div>
            </section>

            {/* ✅ ステータス更新 */}
            <section className="rounded-2xl border bg-white p-5 space-y-3">
                <h2 className="text-sm font-semibold">ステータス更新</h2>
                <StatusEditor id={data.id} initialStatus={String(data.status ?? "new")} />
                <p className="text-xs text-gray-600">※ 更新すると一覧と詳細が再描画されます。</p>
            </section>

            {/* meta（任意表示） */}
            {metaPretty && (
                <section className="rounded-2xl border bg-white p-5 space-y-2">
                    <h2 className="text-sm font-semibold">meta</h2>
                    <pre className="text-xs rounded-xl border bg-gray-50 p-4 overflow-auto">
                        {metaPretty}
                    </pre>
                </section>
            )}
        </main>
    );
}
