// app/subscription/ui.tsx
"use client";

import { useActionState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { createSiteInquiry } from "@/app/site-inquiries/actions";

type Result = { ok: true } | { ok: false; error: string };
type State = Result | null;

function Submit() {
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

export default function InquiryForm({
    defaultPlanTitle,
    defaultPlanCode,
    defaultTab,
    sourcePath,
}: {
    defaultPlanTitle: string;
    defaultPlanCode: string;
    defaultTab: "buyer" | "seller" | "both";
    sourcePath: string;
}) {
    const template = useMemo(() => {
        return `【サブスク相談】
tab: ${defaultTab}
plan: ${defaultPlanTitle} (${defaultPlanCode})

ご相談内容:
`;
    }, [defaultPlanTitle, defaultPlanCode, defaultTab]);

    const [state, action] = useActionState<State, FormData>(async (_prev, fd) => {
        // message が空だと弾かれるので、空ならテンプレだけでも送れるようにする
        const msg = String(fd.get("message") ?? "").trim();
        if (!msg) fd.set("message", template);

        // source_path を確実に入れる（サーバ側で拾える）
        fd.set("source_path", sourcePath);

        const res = await createSiteInquiry(fd);
        return res;
    }, null);

    return (
        <form action={action} className="space-y-3">
            {/* honeypot（bot対策） */}
            <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
            />

            <input type="hidden" name="source_path" value={sourcePath} />

            <div className="grid md:grid-cols-2 gap-3">
                <div>
                    <div className="text-xs text-gray-500 mb-1">お名前</div>
                    <input
                        name="name"
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="例）原田大志"
                        required
                    />
                </div>

                <div>
                    <div className="text-xs text-gray-500 mb-1">メール</div>
                    <input
                        name="email"
                        type="email"
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="例）example@email.com"
                        required
                    />
                </div>
            </div>

            <div>
                <div className="text-xs text-gray-500 mb-1">内容</div>
                <textarea
                    name="message"
                    defaultValue={template}
                    rows={8}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                />
                <div className="text-[11px] text-gray-500 mt-1">
                    ※ この内容は管理画面 /admin（site_inquiries）に保存されます。
                </div>
            </div>

            <div className="flex items-center gap-3">
                <Submit />

                {state && state.ok === true && (
                    <span className="text-sm text-green-700">送信しました（DB保存OK）</span>
                )}
                {state && state.ok === false && (
                    <span className="text-sm text-red-700">{state.error}</span>
                )}
            </div>
        </form>
    );
}
