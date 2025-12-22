// app/admin/inquiries/[id]/noteActions.ts
"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function updateInquiryNote(formData: FormData) {
    const id = String(formData.get("id") ?? "").trim();
    const internal_note = String(formData.get("internal_note") ?? "").trim();

    if (!id) return { ok: false as const, error: "IDが不正です" };
    if (internal_note.length > 5000)
        return { ok: false as const, error: "メモは5000文字までです" };

    const { error } = await supabaseAdmin
        .from("inquiries")
        .update({ internal_note })
        .eq("id", id);

    if (error) return { ok: false as const, error: "保存に失敗しました（DB）" };
    return { ok: true as const };
}
