// app/admin/site-inquiries/[id]/ui.tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateSiteInquiryStatus } from "../actions"; // ✅ ここを修正（./actions → ../actions）

type State = { ok: true } | { ok: false; error: string } | null;

function Submit() {
    const { pending } = useFormStatus();
    return (
        <button
            disabled={pending}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
            {pending ? "更新中..." : "更新"}
        </button>
    );
}

export default function StatusEditor({
    id,
    initialStatus,
}: {
    id: string;
    initialStatus: string;
}) {
    const [state, action] = useActionState<State, FormData>(
        async (_prev, formData) => {
            return await updateSiteInquiryStatus(formData);
        },
        null
    );

    return (
        <form action={action} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="id" value={id} />

            <select
                name="status"
                defaultValue={initialStatus}
                className="rounded-xl border px-3 py-2 text-sm"
            >
                <option value="new">new</option>
                <option value="in_progress">in_progress</option>
                <option value="done">done</option>
            </select>

            <Submit />

            {state && state.ok === false && (
                <span className="text-sm text-red-700">{state.error}</span>
            )}
            {state && state.ok === true && (
                <span className="text-sm text-green-700">更新しました</span>
            )}
        </form>
    );
}
