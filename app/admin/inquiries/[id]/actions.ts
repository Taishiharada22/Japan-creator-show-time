// app/admin/inquiries/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ✅ ここは「named import」だと、lib 側に export が無い時点でビルドが落ちるので
//    まとめて import して、存在したら呼ぶ方式にしておく（あとで lib 側を整備してもOK）
import * as Discord from "@/lib/notifyDiscord";

type Result = { ok: true } | { ok: false; error: string };

const ALLOWED = new Set(["new", "in_progress", "done"]);

function getStr(fd: FormData, key: string) {
    const v = fd.get(key);
    return typeof v === "string" ? v.trim() : "";
}

export async function updateInquiryStatus(formData: FormData): Promise<Result> {
    const id = getStr(formData, "id");
    const status = getStr(formData, "status");

    if (!id) return { ok: false, error: "IDが不正です" };
    if (!ALLOWED.has(status)) return { ok: false, error: "statusが不正です" };

    const { error } = await supabaseAdmin
        .from("inquiries")
        .update({ status })
        .eq("id", id);

    if (error) {
        console.error("[updateInquiryStatus] update error:", error);
        return { ok: false, error: "更新に失敗しました（DB）" };
    }

    // ✅ done になったときだけ Discord 通知（失敗しても更新は成功扱い）
    if (status === "done") {
        try {
            const { data } = await supabaseAdmin
                .from("inquiries")
                .select(
                    "id,created_at,product_id,name,email,message,status,products(title_ja)"
                )
                .eq("id", id)
                .maybeSingle();

            const title =
                data && Array.isArray((data as any).products)
                    ? (data as any).products?.[0]?.title_ja ?? null
                    : (data as any)?.products?.title_ja ?? null;

            const site = process.env.NEXT_PUBLIC_SITE_URL;
            const adminUrl = site ? `${site}/admin/inquiries/${id}` : undefined;

            const fn = (Discord as any).notifyDiscordInquiryDone as
                | undefined
                | ((payload: {
                    inquiryId: string;
                    createdAt?: string | null;
                    productId?: string | null;
                    productTitle?: string | null;
                    name?: string | null;
                    email?: string | null;
                    message?: string | null;
                    adminUrl?: string;
                }) => Promise<void>);

            if (typeof fn === "function") {
                await fn({
                    inquiryId: id,
                    createdAt: (data as any)?.created_at ?? null,
                    productId: (data as any)?.product_id ?? null,
                    productTitle: title,
                    name: (data as any)?.name ?? null,
                    email: (data as any)?.email ?? null,
                    message: (data as any)?.message ?? null,
                    adminUrl,
                });
            } else {
                // lib 側がまだ未実装でも落とさない
                console.warn(
                    "[updateInquiryStatus] notifyDiscordInquiryDone is not exported yet. (skipped)"
                );
            }
        } catch (e) {
            console.error("[updateInquiryStatus] done notify failed:", e);
        }
    }

    revalidatePath("/admin");
    revalidatePath("/admin/inquiries");
    revalidatePath(`/admin/inquiries/${id}`);

    return { ok: true };
}
