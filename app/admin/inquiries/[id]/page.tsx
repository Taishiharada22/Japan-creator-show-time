// app/admin/inquiries/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminInquiryEditor from "./ui";
import NoteEditor from "./NoteEditor";
import ReplyTemplates from "./ReplyTemplates";

export const dynamic = "force-dynamic";

type Row = {
    id: string;
    created_at: string;
    product_id: string;
    status: string;
    name: string;
    email: string;
    message: string;
    internal_note: string | null;
    meta: any;
    products?: { title_ja: string | null } | { title_ja: string | null }[] | null;
};

function fmt(d: string) {
    try {
        return new Date(d).toLocaleString("ja-JP");
    } catch {
        return d;
    }
}

export default async function AdminInquiryDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const inquiryId = params?.id;

    const { data, error } = await supabaseAdmin
        .from("inquiries")
        .select(
            "id,created_at,product_id,status,name,email,message,internal_note,meta,products(title_ja)"
        )
        .eq("id", inquiryId)
        .maybeSingle();

    if (error) {
        return (
            <main className="max-w-4xl mx-auto px-4 py-10">
                <h1 className="text-2xl font-bold">商品問い合わせ（詳細）</h1>
                <p className="text-sm text-red-700 mt-4">取得エラー: {error.message}</p>
                <Link href="/admin/inquiries" className="underline text-blue-700 text-sm">
                    一覧へ戻る
                </Link>
            </main>
        );
    }

    if (!data) return notFound();

    const r = data as Row;

    const productTitle = Array.isArray(r.products)
        ? r.products[0]?.title_ja
        : r.products?.title_ja;

    const mailtoHref = `mailto:${r.email}?subject=${encodeURIComponent(
        "【Japan Culture MVP】商品についてのお問い合わせありがとうございます"
    )}`;

    return (
        <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">
            <div className="text-sm text-gray-600">
                <Link href="/admin/inquiries" className="underline text-blue-700">
                    一覧
                </Link>{" "}
                / 詳細
            </div>

            <header className="space-y-1">
                <h1 className="text-2xl font-bold">商品問い合わせ（詳細）</h1>
                <p className="text-sm text-gray-600">ID: {r.id}</p>
            </header>

            <section className="rounded-2xl border bg-white p-5 space-y-4">
                <div className="text-sm text-gray-700 space-y-1">
                    <div>日時：{fmt(r.created_at)}</div>
                    <div>商品：{productTitle ?? r.product_id}</div>
                    <div>名前：{r.name}</div>
                    <div>メール：{r.email}</div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <a
                        href={mailtoHref}
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        このメールに返信する
                    </a>
                    <Link
                        href="/admin/inquiries"
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        一覧に戻る
                    </Link>
                </div>

                <div className="pt-2">
                    <h2 className="text-sm font-semibold mb-1">内容</h2>
                    <p className="whitespace-pre-wrap text-sm text-gray-800 leading-6">
                        {r.message}
                    </p>
                </div>

                <div className="pt-2">
                    <h2 className="text-sm font-semibold mb-1">ステータス</h2>
                    <AdminInquiryEditor id={r.id} initialStatus={r.status} />
                </div>

                <div className="pt-2">
                    <h2 className="text-sm font-semibold mb-1">運営メモ（内部用）</h2>
                    <NoteEditor id={r.id} initialNote={r.internal_note} />
                </div>
            </section>

            {/* ✅ A-2弾：返信テンプレ（mailto & コピー） */}
            <ReplyTemplates
                name={r.name}
                email={r.email}
                productTitle={productTitle ?? r.product_id}
                message={r.message}
            />

            <section className="rounded-2xl border bg-white p-5">
                <h2 className="text-sm font-semibold mb-2">メタ情報</h2>
                <pre className="text-xs bg-gray-50 rounded-xl p-3 overflow-auto">
                    {JSON.stringify(r.meta ?? {}, null, 2)}
                </pre>
            </section>
        </main>
    );
}
