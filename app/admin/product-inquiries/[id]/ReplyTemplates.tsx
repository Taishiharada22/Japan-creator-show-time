"use client";

import { useMemo, useState } from "react";

type Props = {
    leadId: string;
    customerName: string | null;
    customerEmail: string | null;
    message: string;
    productName: string | null;
    productUrl: string | null;
};

function buildCustomerMail(p: Props) {
    const name = p.customerName?.trim() || "お客様";
    const product = p.productName?.trim() || "（商品名不明）";
    const url = p.productUrl?.trim() || "（URLなし）";

    const subject = "【Japan Culture MVP】お問い合わせありがとうございます（受付完了）";

    const body =
        `${name} 様

お問い合わせありがとうございます。内容を確認し、担当よりご連絡いたします。

■ お問い合わせ対象
・商品名：${product}
・URL：${url}

■ お問い合わせ内容
${p.message}

（管理用ID：${p.leadId}）

※本メールは自動送信です。返信いただいても確認できない場合があります。
`;

    return { subject, body };
}

function buildInternalNote(p: Props) {
    const name = p.customerName?.trim() || "(未入力)";
    const email = p.customerEmail?.trim() || "(未入力)";
    const product = p.productName?.trim() || "(不明)";
    const url = p.productUrl?.trim() || "(なし)";

    const text =
        `【対応メモ（社内用）】
LeadID: ${p.leadId}

お客様: ${name} / ${email}
商品: ${product}
URL: ${url}

内容:
${p.message}
`;
    return text;
}

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export default function ReplyTemplates(props: Props) {
    const [toast, setToast] = useState<string | null>(null);

    const customerMail = useMemo(() => buildCustomerMail(props), [props]);
    const internalNote = useMemo(() => buildInternalNote(props), [props]);

    const mailtoHref = useMemo(() => {
        const to = props.customerEmail?.trim() || "";
        if (!to) return null;

        const subject = encodeURIComponent(customerMail.subject);
        const body = encodeURIComponent(customerMail.body);
        return `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
    }, [props.customerEmail, customerMail.subject, customerMail.body]);

    async function onCopy(label: string, text: string) {
        const ok = await copyToClipboard(text);
        setToast(ok ? `${label} をコピーしました` : `${label} のコピーに失敗しました`);
        window.setTimeout(() => setToast(null), 1800);
    }

    return (
        <section className="rounded-2xl border bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold">返信テンプレ（コピペ用）</h2>

            {toast ? (
                <div className="text-xs text-green-700">{toast}</div>
            ) : (
                <div className="text-xs text-gray-600">
                    まずは「受付完了」をコピペで返す運用でOK（MVP）。
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
                {/* お客様向け */}
                <div className="rounded-xl border p-4 space-y-2">
                    <div className="text-sm font-semibold">① お客様へ（受付完了）</div>

                    <div className="text-xs text-gray-600">件名</div>
                    <pre className="text-xs rounded-lg border bg-gray-50 p-3 overflow-auto">
                        {customerMail.subject}
                    </pre>

                    <div className="text-xs text-gray-600">本文</div>
                    <pre className="text-xs rounded-lg border bg-gray-50 p-3 overflow-auto whitespace-pre-wrap">
                        {customerMail.body}
                    </pre>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            onClick={() => onCopy("件名", customerMail.subject)}
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                        >
                            件名コピー
                        </button>
                        <button
                            onClick={() => onCopy("本文", customerMail.body)}
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                        >
                            本文コピー
                        </button>

                        {mailtoHref ? (
                            <a
                                href={mailtoHref}
                                className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                            >
                                メール作成を開く
                            </a>
                        ) : (
                            <span className="text-xs text-gray-500">
                                （email未入力のため mailto なし）
                            </span>
                        )}
                    </div>
                </div>

                {/* 社内メモ */}
                <div className="rounded-xl border p-4 space-y-2">
                    <div className="text-sm font-semibold">② 社内メモ（貼り付け用）</div>

                    <pre className="text-xs rounded-lg border bg-gray-50 p-3 overflow-auto whitespace-pre-wrap">
                        {internalNote}
                    </pre>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            onClick={() => onCopy("社内メモ", internalNote)}
                            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                        >
                            メモコピー
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
