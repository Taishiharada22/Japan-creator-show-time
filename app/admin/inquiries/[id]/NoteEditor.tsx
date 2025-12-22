// app/admin/inquiries/[id]/NoteEditor.tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateInquiryNote } from "./noteActions";

type State = { ok: true } | { ok: false; error: string } | null;

function SaveButton() {
    const { pending } = useFormStatus();
    return (
        <button
            disabled={pending}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
            {pending ? "保存中..." : "メモ保存"}
        </button>
    );
}

export default function NoteEditor({
    id,
    initialNote,
}: {
    id: string;
    initialNote: string | null;
}) {
    const [state, action] = useActionState<State, FormData>(
        async (_prev, formData) => {
            return await updateInquiryNote(formData);
        },
        null
    );

    return (
        <form action={action} className="space-y-2">
            <input type="hidden" name="id" value={id} />

            <textarea
                name="internal_note"
                defaultValue={initialNote ?? ""}
                rows={5}
                placeholder="対応状況メモ（例：12/19 返信済み、要フォローなど）"
                className="w-full rounded-xl border px-3 py-2 text-sm"
            ></textarea>

            <div className="flex items-center gap-3">
                <SaveButton />
                {state && state.ok === false && (
                    <span className="text-sm text-red-700">{state.error}</span>
                )}
                {state && state.ok === true && (
                    <span className="text-sm text-green-700">保存しました</span>
                )}
            </div>
        </form>
    );
}
