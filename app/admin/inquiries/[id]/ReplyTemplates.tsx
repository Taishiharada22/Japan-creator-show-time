// app/admin/inquiries/[id]/ReplyTemplates.tsx
"use client";

import { useMemo, useState } from "react";

function copy(text: string) {
    if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(text);
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
}

export default function ReplyTemplates(props: {
    name: string;
    email: string;
    productTitle: string;
    message: string;
}) {
    const [copied, setCopied] = useState<string | null>(null);

    const subject = "【Japan Culture MVP】お問い合わせありがとうございます（受付完了）";

    const body = useMemo(() => {
        return (
            `${props.name} 様\n\n` +
            `お問い合わせありがとうございます。\n` +
            `以下の内容で受け付けました。\n\n` +
            `■ 商品：${props.productTitle}\n` +
            `■ お問い合わせ内容：\n${props.message}\n\n` +
            `担当より確認のうえ、追ってご連絡いたします。\n` +
            `よろしくお願いいたします。\n\n` +
            `Japan Culture MVP 運営`
        );
    }, [props.name, props.productTitle, props.message]);

    const mailto = useMemo(() => {
        const s = encodeURIComponent(subject);
        const b = encodeURIComponent(body);
        return `mailto:${props.email}?subject=${s}&body=${b}`;
    }, [props.email, subject, body]);

    async function doCopy(label: string, text: string) {
        await copy(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 1200);
    }

    return (
        <div className="rounded-2xl border bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold">返信テンプレ（ワンクリック）</h2>

            <div className="flex flex-wrap gap-2">
                <a href={mailto} className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
                    メール作成（mailto）
                </a>
                <button
                    type="button"
                    onClick={() => doCopy("件名", subject)}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                >
                    件名をコピー
                </button>
                <button
                    type="button"
                    onClick={() => doCopy("本文", body)}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
                >
                    本文をコピー
                </button>
            </div>

            <div className="text-xs text-gray-600">
                {copied ? `✅ ${copied}をコピーしました` : "※ 必要なら本文を編集して送ってOK"}
            </div>
        </div>
    );
}
