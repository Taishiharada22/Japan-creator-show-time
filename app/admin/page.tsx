// app/admin/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

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

function fmtJST(d: string) {
    try {
        return new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    } catch {
        return d;
    }
}

export default async function AdminPage({
    searchParams,
}: {
    searchParams?: Record<string, string | string[] | undefined>;
}) {
    const sp = searchParams ?? {};

    // ✅ デフォルトは "new"
    const statusParam = typeof sp.status === "string" ? sp.status : "";
    const status = statusParam ? statusParam : "new";

    const q = typeof sp.q === "string" ? sp.q.trim() : "";

    const { data, error } = await supabaseAdmin
        .from("site_inquiries")
        .select("id,created_at,updated_at,status,name,email,source_path,message")
        .order("updated_at", { ascending: false })
        .limit(200);

    const rowsAll: Row[] = (data ?? []) as any;

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

    const qLower = q.toLowerCase();
    let rows: Row[] = rowsAll;

    if (status !== "all") rows = rows.filter((r) => r.status === status);

    if (qLower) {
        rows = rows.filter((r) => {
            const hay = [r.id, r.status, r.name, r.email, r.source_path ?? "", r.message]
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
            <header className="space-y-3">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold">管理トップ</h1>
                    <p className="text-sm text-gray-600">運営お問い合わせ（site_inquiries）管理</p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/admin?status=new"
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        運営お問い合わせ（管理トップ）
                    </Link>

                    <Link
                        href="/admin/site-inquiries?status=new"
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        運営お問い合わせ（専用一覧）
                    </Link>

                    <Link
                        href="/admin/product-inquiries"
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        商品お問い合わせ（管理）
                    </Link>
                </div>

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
                                href={makeHref("/admin", { status: t.key, q: q || undefined })}
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
                        placeholder="検索（名前 / メール / 内容 / 送信元 / id）"
                        className="w-full md:w-[520px] rounded-xl border px-3 py-2 text-sm"
                    />
                    <button className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
                        検索
                    </button>

                    <Link
                        href="/admin?status=new"
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
                    <div className="col-span-2">送信元</div>
                    <div className="col-span-3">内容</div>
                </div>

                {rows.length === 0 ? (
                    <div className="px-4 py-10 text-sm text-gray-600">該当するお問い合わせがありません。</div>
                ) : (
                    <ul className="divide-y">
                        {rows.map((r) => {
                            const when = fmtJST((r.updated_at ?? r.created_at) as string);

                            const badge =
                                r.status === "new"
                                    ? "bg-white"
                                    : r.status === "in_progress"
                                        ? "bg-yellow-50"
                                        : "bg-green-50";

                            return (
                                <li key={r.id} className="px-4 py-3">
                                    <div className="grid grid-cols-12 gap-2 items-start">
                                        <div className="col-span-2 text-xs text-gray-600">{when}</div>

                                        <div className="col-span-2">
                                            <span
                                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badge}`}
                                            >
                                                {r.status}
                                            </span>
                                        </div>

                                        <div className="col-span-3">
                                            <div className="text-sm font-semibold">{r.name}</div>
                                            <div className="text-xs text-gray-600 break-all">{r.email}</div>
                                        </div>

                                        <div className="col-span-2">
                                            <div className="text-xs text-gray-700 break-all">{r.source_path ?? "-"}</div>
                                        </div>

                                        <div className="col-span-3">
                                            <div className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-3">
                                                {r.message}
                                            </div>
                                            <div className="pt-1">
                                                <Link
                                                    href={`/admin/site-inquiries/${r.id}`}
                                                    className="text-xs underline text-blue-700"
                                                >
                                                    詳細を見る
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </main>
    );
}
