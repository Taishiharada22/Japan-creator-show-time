// app/admin/product-inquiries/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateProductInquiryStatus } from "../actions";
import ReplyTemplates from "./ReplyTemplates";

export const dynamic = "force-dynamic";

function fmtJST(v: string) {
    const d = new Date(v);
    return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function maskWebhook(url: string) {
    // token部分を隠して表示（安全のため）
    // https://discord.com/api/webhooks/{id}/{token}
    try {
        const u = new URL(url);
        const parts = u.pathname.split("/").filter(Boolean); // ["api","webhooks","id","token"]
        const tokenIndex = parts.length - 1; // 最後がtoken
        if (tokenIndex >= 0 && parts[tokenIndex]) {
            parts[tokenIndex] = "********";
            u.pathname = "/" + parts.join("/");
            return u.toString();
        }
    } catch { }
    return "(invalid url)";
}

export default async function ProductInquiryDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
        .from("product_inquiries")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        return (
            <main className="max-w-5xl mx-auto px-4 py-10 space-y-3">
                <h1 className="text-2xl font-bold">商品お問い合わせ（詳細）</h1>
                <p className="text-sm text-red-700">DB取得エラー: {error.message}</p>
                <Link className="text-sm underline" href="/admin/product-inquiries">
                    一覧へ戻る
                </Link>
            </main>
        );
    }

    if (!data) return notFound();

    // maker情報（display_name / webhook）
    const makerId = String(data.maker_id ?? "").trim();
    let maker:
        | { display_name: string | null; notify_discord_webhook_url: string | null }
        | null = null;

    if (makerId) {
        const { data: m } = await supabaseAdmin
            .from("makers")
            .select("display_name, notify_discord_webhook_url")
            .eq("id", makerId)
            .maybeSingle();

        maker = (m ?? null) as any;
    }

    const makerName = maker?.display_name?.trim() || (makerId ? makerId : "(なし)");
    const webhookUrl = maker?.notify_discord_webhook_url?.trim() || "";
    const webhookMasked = webhookUrl ? maskWebhook(webhookUrl) : "";

    const metaPretty = data.meta ? JSON.stringify(data.meta, null, 2) : "";

    return (
        <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">商品お問い合わせ（詳細）</h1>
                    <p className="text-sm text-gray-600">
                        LeadID: <span className="font-mono">{data.id}</span>
                    </p>
                </div>
                <div className="flex gap-3">
                    <Link className="text-sm underline" href="/admin/product-inquiries">
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
                        <div className="text-xs text-gray-500">商品</div>
                        <div className="font-semibold">{data.product_name ?? "(不明)"}</div>
                        {data.product_url ? (
                            <a
                                href={data.product_url}
                                target="_blank"
                                className="text-xs underline text-blue-700 break-all"
                                rel="noreferrer"
                            >
                                {data.product_url}
                            </a>
                        ) : (
                            <div className="text-xs text-gray-500">URLなし</div>
                        )}
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">maker</div>
                        <div className="font-semibold">{makerName}</div>
                        <div className="font-mono text-xs break-all text-gray-600">{makerId || "-"}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">source_path</div>
                        <div className="font-mono text-xs break-all">{data.source_path ?? "-"}</div>
                    </div>
                </div>

                <div className="pt-3">
                    <div className="text-xs text-gray-500 mb-1">内容</div>
                    <pre className="whitespace-pre-wrap text-sm leading-6 rounded-xl border bg-gray-50 p-4">
                        {data.message}
                    </pre>
                </div>
            </section>

            {/* 作り手側通知の設定状況 */}
            <section className="rounded-2xl border bg-white p-5 space-y-2">
                <h2 className="text-sm font-semibold">作り手通知設定</h2>

                {!makerId ? (
                    <p className="text-sm text-gray-700">maker_id がありません（作り手が紐づいていません）。</p>
                ) : (
                    <div className="space-y-1 text-sm">
                        <p>
                            <span className="text-xs text-gray-500">display_name:</span>{" "}
                            <span className="font-semibold">{maker?.display_name ?? "(未設定)"}</span>
                        </p>
                        <p>
                            <span className="text-xs text-gray-500">Discord webhook:</span>{" "}
                            {webhookUrl ? (
                                <span className="font-mono text-xs break-all">{webhookMasked}</span>
                            ) : (
                                <span className="text-red-700 font-semibold">未設定</span>
                            )}
                        </p>
                        {!webhookUrl && (
                            <p className="text-xs text-gray-600">
                                ※ 未設定だと「作り手Discordへの転送」は失敗します（DB保存はされます）。
                            </p>
                        )}
                    </div>
                )}
            </section>

            {/* ステータス更新 */}
            <section className="rounded-2xl border bg-white p-5 space-y-3">
                <h2 className="text-sm font-semibold">ステータス更新</h2>

                <form action={updateProductInquiryStatus} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={data.id} />

                    {["new", "forwarded", "replied", "closed"].map((s) => (
                        <button
                            key={s}
                            name="status"
                            value={s}
                            className={`rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 ${data.status === s ? "bg-black text-white border-black" : ""
                                }`}
                        >
                            {s}
                        </button>
                    ))}
                </form>

                <p className="text-xs text-gray-600">※ 更新すると一覧と詳細が再描画されます。</p>
            </section>

            {/* 返信テンプレ（コピーボタン付き） */}
            <ReplyTemplates
                leadId={data.id}
                customerName={data.name ?? null}
                customerEmail={data.email ?? null}
                message={data.message ?? ""}
                productName={data.product_name ?? null}
                productUrl={data.product_url ?? null}
            />

            {/* meta */}
            {metaPretty && (
                <section className="rounded-2xl border bg-white p-5 space-y-2">
                    <h2 className="text-sm font-semibold">meta</h2>
                    <pre className="text-xs rounded-xl border bg-gray-50 p-4 overflow-auto">{metaPretty}</pre>
                </section>
            )}
        </main>
    );
}
