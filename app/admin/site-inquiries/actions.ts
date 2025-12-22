// app/admin/site-inquiries/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SiteInquiryResult = { ok: true } | { ok: false; error: string };

const ALLOWED = new Set(["new", "in_progress", "done"] as const);

export async function updateSiteInquiryStatus(formData: FormData): Promise<SiteInquiryResult> {
    const id = String(formData.get("id") ?? "").trim();
    const nextStatus = String(formData.get("status") ?? "").trim();

    if (!id) return { ok: false, error: "IDが不正です" };
    if (!nextStatus) return { ok: false, error: "status が未指定です" };
    if (!ALLOWED.has(nextStatus as any)) return { ok: false, error: "status が不正です" };

    const { data: before, error: readErr } = await supabaseAdmin
        .from("site_inquiries")
        .select("id,status")
        .eq("id", id)
        .maybeSingle();

    if (readErr) return { ok: false, error: "取得に失敗しました（DB）" };
    if (!before) return { ok: false, error: "対象が見つかりません" };

    // 同じなら更新不要（でも画面は更新）
    if (String(before.status ?? "") === nextStatus) {
        revalidatePath("/admin/site-inquiries");
        revalidatePath(`/admin/site-inquiries/${id}`);
        return { ok: true };
    }

    const { error: updErr } = await supabaseAdmin
        .from("site_inquiries")
        .update({ status: nextStatus })
        .eq("id", id);

    if (updErr) return { ok: false, error: "更新に失敗しました（DB）" };

    revalidatePath("/admin/site-inquiries");
    revalidatePath(`/admin/site-inquiries/${id}`);
    return { ok: true };
}
