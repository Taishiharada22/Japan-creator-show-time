// app/products/[id]/InquiryForm.tsx
"use client";

import { useMemo, useState } from "react";

type Props = {
    productId: string;
    makerId?: string | null;
    productName?: string;
    productUrl?: string;     // 相対でもOK（/products/xxx）
    sourcePath?: string;     // /products/xxx
    isExperience?: boolean;
};

export default function InquiryForm({
    productId,
    makerId = null,
    productName = "",
    productUrl,
    sourcePath,
    isExperience = false,
}: Props) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");

    const [pending, setPending] = useState(false);
    const [ok, setOk] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const heading = useMemo(() => {
        return isExperience ? "この体験について問い合わせる" : "この商品について問い合わせる";
    }, [isExperience]);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setOk(false);

        const m = message.trim();
        if (!m) return setErr("お問い合わせ内容を入力してください。");
        if (m.length > 3000) return setErr("お問い合わせ内容が長すぎます（最大3000文字）。");

        setPending(true);
        try {
            const url =
                productUrl?.startsWith("http")
                    ? productUrl
                    : typeof window !== "undefined"
                        ? new URL(productUrl || window.location.pathname, window.location.origin).toString()
                        : productUrl || "";

            const payload = {
                kind: "product",
                // honeypot（空で送る）
                company: "",

                name: name.trim(),
                email: email.trim(),
                message: m,

                productId,
                productName: productName.trim(),
                productUrl: url,

                // ✅ 重要：サーバは makerId（camelCase）を読む
                makerId: makerId ?? null,

                // ✅ route.ts は source_path を読む
                source_path:
                    sourcePath ||
                    (typeof window !== "undefined" ? window.location.pathname : null),
            };

            const res = await fetch("/api/inquiry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const j = await res.json().catch(() => null);
                console.error("POST /api/inquiry failed:", res.status, j);
                setErr(j?.error || "送信に失敗しました。");
                return;
            }

            setOk(true);
            setMessage("");
        } catch (e: any) {
            console.error(e);
            setErr("送信に失敗しました。");
        } finally {
            setPending(false);
        }
    }

    return (
        <section className="rounded-2xl border bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold">{heading}</h2>


            <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1">
                    <label className="text-sm font-medium">お名前</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="例）山田 太郎"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium">メール</label>
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="example@mail.com"
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium">お問い合わせ内容（必須）</label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={5}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="例）在庫 / 納期 / 体験の予約方法など"
                    />
                    <p className="text-xs text-gray-600">※ 3000文字まで</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        disabled={pending}
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                    >
                        {pending ? "送信中..." : "送信"}
                    </button>

                    {err && <span className="text-sm text-red-700">{err}</span>}
                    {ok && <span className="text-sm text-green-700">送信しました</span>}
                </div>
            </form>
        </section>
    );
}
