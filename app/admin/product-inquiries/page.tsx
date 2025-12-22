// app/admin/product-inquiries/page.tsx
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateProductInquiryStatus } from "./actions";

export const dynamic = "force-dynamic";

function fmtJST(v: string) {
    const d = new Date(v);
    return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function StatusPill({ status }: { status: string }) {
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs";
    if (status === "new") return <span className={`${base} bg-white`}>new</span>;
    if (status === "forwarded") return <span className={`${base} bg-white`}>forwarded</span>;
    if (status === "replied")
        return <span className={`${base} bg-black text-white border-black`}>replied</span>;
    if (status === "closed") return <span className={`${base} bg-gray-100`}>closed</span>;
    return <span className={base}>{status}</span>;
}

export default async function ProductInquiriesAdminPage() {
    const { data, error } = await supabaseAdmin
        .from("product_inquiries")
        .select("id, created_at, status, name, email, message, product_name, product_url, maker_id, source_path")
        .order("created_at", { ascending: false })
        .limit(200);

    return (
        <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">商品お問い合わせ（管理）</h1>
                    <p className="text-sm text-gray-600">最新200件（新しい順）</p>
                </div>
                <div className="flex gap-3">
                    <Link className="text-sm underline" href="/admin">
                        管理トップ
                    </Link>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border bg-white p-4 text-sm text-red-700">
                    DB取得エラー: {error.message}
                </div>
            )}

            {!data?.length ? (
                <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">
                    該当するお問い合わせがありません。
                </div>
            ) : (
                <section className="rounded-2xl border bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 whitespace-nowrap">日時</th>
                                    <th className="text-left px-4 py-3 whitespace-nowrap">ステータス</th>
                                    <th className="text-left px-4 py-3">商品</th>
                                    <th className="text-left px-4 py-3">お客様</th>
                                    <th className="text-left px-4 py-3">内容</th>
                                    <th className="text-left px-4 py-3 whitespace-nowrap">操作</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y">
                                {data.map((r) => {
                                    const msg = String(r.message ?? "");
                                    const snippet = msg.length > 60 ? msg.slice(0, 60) + "…" : msg;

                                    const s = String(r.status ?? "");

                                    return (
                                        <tr key={r.id} className="align-top">
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                                                {fmtJST(r.created_at)}
                                            </td>

                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <StatusPill status={s} />
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="font-semibold">{r.product_name ?? "(不明)"}</div>
                                                {r.product_url ? (
                                                    <a
                                                        href={String(r.product_url)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs underline text-blue-700 break-all"
                                                    >
                                                        {String(r.product_url)}
                                                    </a>
                                                ) : (
                                                    <div className="text-xs text-gray-500">URLなし</div>
                                                )}

                                                <div className="text-xs text-gray-500 mt-1">
                                                    maker_id: <span className="font-mono">{r.maker_id ?? "-"}</span>
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    source: <span className="font-mono">{r.source_path ?? "-"}</span>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="font-semibold">{r.name ?? "(未入力)"}</div>
                                                <div className="text-xs text-gray-600 break-all">{r.email ?? "(未入力)"}</div>
                                            </td>

                                            <td className="px-4 py-3 text-gray-800">{snippet}</td>

                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex flex-col gap-2">
                                                    <Link href={`/admin/product-inquiries/${r.id}`} className="text-sm underline">
                                                        詳細
                                                    </Link>

                                                    {/* replied にする（replied済なら出さない） */}
                                                    {s !== "replied" && (
                                                        <form action={updateProductInquiryStatus}>
                                                            <input type="hidden" name="id" value={String(r.id)} />
                                                            <input type="hidden" name="status" value="replied" />
                                                            <button className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">
                                                                replied にする
                                                            </button>
                                                        </form>
                                                    )}

                                                    {/* closed にする（closed済なら出さない） */}
                                                    {s !== "closed" && (
                                                        <form action={updateProductInquiryStatus}>
                                                            <input type="hidden" name="id" value={String(r.id)} />
                                                            <input type="hidden" name="status" value="closed" />
                                                            <button className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">
                                                                closed にする
                                                            </button>
                                                        </form>
                                                    )}

                                                    {/* new に戻す（newなら出さない） */}
                                                    {s !== "new" && (
                                                        <form action={updateProductInquiryStatus}>
                                                            <input type="hidden" name="id" value={String(r.id)} />
                                                            <input type="hidden" name="status" value="new" />
                                                            <button className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">
                                                                new に戻す
                                                            </button>
                                                        </form>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </main>
    );
}
