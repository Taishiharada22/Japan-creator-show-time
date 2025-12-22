// app/admin/_actions/quickStatus.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED = new Set(["new", "in_progress", "done"]);

function getStr(fd: FormData, key: string) {
    const v = fd.get(key);
    return typeof v === "string" ? v.trim() : "";
}

function assertAllowedStatus(status: string) {
    if (!ALLOWED.has(status)) {
        throw new Error("statusが不正です");
    }
}

// ✅ form action 用：失敗時は throw（client 側の catch が拾える）
export async function quickUpdateProductInquiryStatus(
    formData: FormData
): Promise<void> {
    const id = getStr(formData, "id");
    const status = getStr(formData, "status");

    if (!id) throw new Error("IDが不正です");
    assertAllowedStatus(status);

    const { error } = await supabaseAdmin.from("inquiries").update({ status }).eq("id", id);

    if (error) {
        console.error("[quickUpdateProductInquiryStatus] update error:", error);
        throw new Error("更新に失敗しました（DB）");
    }

    revalidatePath("/admin");
    revalidatePath("/admin/inquiries");
    revalidatePath(`/admin/inquiries/${id}`);
}

export async function quickUpdateSiteInquiryStatus(
    formData: FormData
): Promise<void> {
    const id = getStr(formData, "id");
    const status = getStr(formData, "status");

    if (!id) throw new Error("IDが不正です");
    assertAllowedStatus(status);

    const { error } = await supabaseAdmin.from("site_inquiries").update({ status }).eq("id", id);

    if (error) {
        console.error("[quickUpdateSiteInquiryStatus] update error:", error);
        throw new Error("更新に失敗しました（DB）");
    }

    revalidatePath("/admin");
    revalidatePath("/admin/site-inquiries");
    revalidatePath(`/admin/site-inquiries/${id}`);
}
