"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createSiteInquiry } from "@/app/site-inquiries/actions";

type Result = { ok: true } | { ok: false; error: string } | null;

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            disabled={pending}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
            {pending ? "送信中..." : "送信"}
        </button>
    );
}

// ✅ ここが今回のポイント：sourcePath を受け取る
export default function SiteInquiryForm({ sourcePath = "/" }: { sourcePath?: string }) {
    const [state, formAction] = useActionState<Result, FormData>(
        async (_prev, formData) => {
            return await createSiteInquiry(formData);
        },
        null
    );

    return (
        <form action={formAction} className="space-y-3 relative">
            {/* ✅ 送信元パス（どのページから来たか） */}
            <input type="hidden" name="source_path" value={sourcePath} />

            {/* ✅ honeypot（見えない・触れない） */}
            <label className="sr-only" htmlFor="company">Company</label>
            <input
                id="company"
                name="company"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
            />

            <div className="space-y-1">
                <label className="text-sm font-medium">お名前</label>
                <input
                    name="name"
                    placeholder="例）山田 太郎"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                />
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">メール</label>
                <input
                    name="email"
                    type="email"
                    placeholder="example@mail.com"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                />
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">内容</label>
                <textarea
                    name="message"
                    rows={4}
                    placeholder="例）掲載について / 不具合報告 / 取材の相談 など"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                ></textarea>
                <p className="text-xs text-gray-600">※ 3000文字まで</p>
            </div>

            <div className="flex items-center gap-3">
                <SubmitButton />
                {state && state.ok === false && (
                    <span className="text-sm text-red-700">{state.error}</span>
                )}
                {state && state.ok === true && (
                    <span className="text-sm text-green-700">送信しました</span>
                )}
            </div>
        </form>
    );
}
