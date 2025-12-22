// app/admin/inquiries/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import ProductInquiryListItem from "@/app/admin/_components/ProductInquiryListItem";

export const dynamic = "force-dynamic";

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

function makeHref(path: string, params: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v && v.length > 0) sp.set(k, v);
    });
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
}

// ✅ new → in_progress → done
const STATUS_RANK: Record<string, number> = { new: 0, in_progress: 1, done: 2 };
function rank(status: string) {
    return STATUS_RANK[status] ?? 99;
}
function timeOf(d: string | null | undefined) {
    if (!d) return 0;
    const t = new Date(d).getTime();
    return Number.isFinite(t) ? t : 0;
}

export default async function AdminInquiriesPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = (await searchParams) ?? {};

    // ✅ デフォルトは "new"
    const statusParam = typeof sp.status === "string" ? sp.status : "";
    const status = statusParam ? statusParam : "new";

    const q = typeof sp.q === "string" ? sp.q.trim() : "";
    const noNote = typeof sp.noNote === "string" ? sp.noNote === "1" : false;

    const { data, error } = await supabaseAdmin
        .from("inquiries")
        .select(
            "id,created_at,updated_at,product_id,status,name,email,message,internal_note,products(title_ja)"
        )
        .order("updated_at", { ascending: false })
        .limit(200);

    const raw: Row[] = (data ?? []) as any;

    // products参照が配列になるケースを吸収して title_ja を正規化
    const rowsAll: Row[] = raw.map((r: any) => {
        const title = Array.isArray(r.products)
            ? r.products[0]?.title_ja ?? null
            : r.products?.title_ja ?? null;
        return { ...r, products: { title_ja: title } } as Row;
    });

    // 件数（タブ用）
    const counts = rowsAll.reduce(
        (acc, r) => {
            acc.all += 1;
            if (r.status === "new") acc.new += 1;
            else if (r.status === "in_progress") acc.in_progress += 1;
            else if (r.status === "done") acc.done += 1;
            return acc;
        },
        { all: 0, new: 0, in_progress: 0, done: 0 }
    );

    // フィルタ
    const qLower = q.toLowerCase();
    let rows: Row[] = rowsAll;

    if (status !== "all") rows = rows.filter((r) => r.status === status);

    if (noNote) rows = rows.filter((r) => !(r.internal_note ?? "").trim());

    if (qLower) {
        rows = rows.filter((r) => {
            const productTitle = Array.isArray(r.products)
                ? (r.products as any)[0]?.title_ja
                : (r.products as any)?.title_ja;

            const hay = [
                r.id,
                r.product_id,
                r.status,
                r.name,
                r.email,
                r.message,
                productTitle ?? "",
            ]
                .join(" ")
                .toLowerCase();

            return hay.includes(qLower);
        });
    }

    // ✅ 並び替え：status優先 → updated_at（なければcreated_at）新しい順
    rows = rows.slice().sort((a, b) => {
        const ra = rank(a.status);
        const rb = rank(b.status);
        if (ra !== rb) return ra - rb;

        const ta = timeOf(a.updated_at) || timeOf(a.created_at);
        const tb = timeOf(b.updated_at) || timeOf(b.created_at);
        return tb - ta;
    });

    return (
        <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-bold">商品問い合わせ（管理）</h1>

                <div className="flex flex-wrap gap-2 text-sm">
                    {[
                        { key: "all", label: `すべて (${counts.all})` },
                        { key: "new", label: `new (${counts.new})` },
                        { key: "in_progress", label: `in_progress (${counts.in_progress})` },
                        { key: "done", label: `done (${counts.done})` },
                    ].map((t) => {
                        const active = status === t.key;
                        return (
                            <Link
                                key={t.key}
                                href={makeHref("/admin/inquiries", {
                                    status: t.key,
                                    q: q || undefined,
                                    noNote: noNote ? "1" : undefined,
                                })}
                                className={`rounded-xl border px-3 py-1.5 ${active ? "bg-black text-white border-black" : "hover:bg-gray-50"
                                    }`}
                            >
                                {t.label}
                            </Link>
                        );
                    })}
                </div>

                <form className="flex flex-wrap items-center gap-2" method="get">
                    <input type="hidden" name="status" value={status} />
                    <input
                        name="q"
                        defaultValue={q}
                        placeholder="検索（名前 / メール / 内容 / 商品ID / 商品名 / inquiryId）"
                        className="w-full md:w-[520px] rounded-xl border px-3 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" name="noNote" value="1" defaultChecked={noNote} />
                        メモなしだけ
                    </label>
                    <button className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
                        検索
                    </button>
                    <Link
                        href="/admin/inquiries?status=new"
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        クリア
                    </Link>
                </form>
            </header>

            {error && <p className="text-sm text-red-700">取得エラー: {error.message}</p>}

            <section className="rounded-2xl border bg-white overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-gray-500 border-b">
                    <div className="col-span-2">日時</div>
                    <div className="col-span-2">ステータス</div>
                    <div className="col-span-3">名前 / メール</div>
                    <div className="col-span-4">商品</div>
                    <div className="col-span-1 text-right">メモ</div>
                </div>

                {rows.length === 0 ? (
                    <div className="px-4 py-10 text-sm text-gray-600">該当する問い合わせがありません。</div>
                ) : (
                    <ul className="divide-y">
                        {rows.map((r) => (
                            <ProductInquiryListItem key={r.id} r={r} />
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
