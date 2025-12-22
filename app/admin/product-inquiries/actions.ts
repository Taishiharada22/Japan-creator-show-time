// app/admin/product-inquiries/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { postToDiscord } from "@/lib/discord";

// makers.notify_discord_webhook_url に直接投げる用
async function postToDiscordUrl(url: string, content: string) {
    // Discordは content 2000文字制限
    const safe = content.length > 1900 ? content.slice(0, 1900) + "…" : content;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: safe }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Discord webhook failed:", res.status, text);
        throw new Error(`Discord webhook failed: ${res.status}`);
    }
}

const ALLOWED = new Set(["new", "forwarded", "replied", "closed"] as const);

export async function updateProductInquiryStatus(formData: FormData) {
    const id = String(formData.get("id") ?? "").trim();
    const nextStatus = String(formData.get("status") ?? "").trim();

    // ✅ ここが肝：status無しsubmitが来ても落とさない（Enterキーなど）
    if (!id) {
        console.warn("updateProductInquiryStatus: missing id");
        return;
    }
    if (!nextStatus) {
        console.warn("updateProductInquiryStatus: missing status", { id });
        revalidatePath("/admin/product-inquiries");
        revalidatePath(`/admin/product-inquiries/${id}`);
        return;
    }
    if (!ALLOWED.has(nextStatus as any)) {
        console.warn("updateProductInquiryStatus: invalid status", { id, nextStatus });
        return;
    }

    // 現状取得（同じ状態に更新した場合は無駄通知しない）
    const { data: before, error: readErr } = await supabaseAdmin
        .from("product_inquiries")
        .select("id,status,product_name,product_url,name,email,maker_id,created_at")
        .eq("id", id)
        .maybeSingle();

    if (readErr) {
        console.error("read product_inquiry failed:", readErr);
        throw new Error("failed to read");
    }
    if (!before) return;

    const prevStatus = String(before.status ?? "");
    if (prevStatus === nextStatus) {
        revalidatePath("/admin/product-inquiries");
        revalidatePath(`/admin/product-inquiries/${id}`);
        return;
    }

    // 更新
    const { error: updErr } = await supabaseAdmin
        .from("product_inquiries")
        .update({ status: nextStatus })
        .eq("id", id);

    if (updErr) {
        console.error("updateProductInquiryStatus failed:", updErr);
        throw new Error("failed to update");
    }

    const nowJST = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    // maker表示名 + webhook
    let makerLabel = before.maker_id ? String(before.maker_id) : "(なし)";
    let makerWebhook = "";

    try {
        if (before.maker_id) {
            const { data: maker } = await supabaseAdmin
                .from("makers")
                .select("display_name, notify_discord_webhook_url")
                .eq("id", before.maker_id)
                .maybeSingle();

            if (maker?.display_name) makerLabel = maker.display_name;
            makerWebhook = (maker?.notify_discord_webhook_url ?? "").trim();
        }
    } catch (e: any) {
        console.error("read maker failed:", e?.message ?? e);
    }

    // 運営Discordへ通知（失敗しても更新は成功してるので握りつぶす）
    try {
        const content = `📝 商品問い合わせ：ステータス更新
🕒 ${nowJST}
🧾 LeadID: ${before.id}
🔁 ${prevStatus} → ${nextStatus}

🏷 商品名: ${before.product_name ?? "(不明)"}
🔗 URL: ${before.product_url ?? "(なし)"}

👤 お客様: ${before.name ?? "(未入力)"} / ${before.email ?? "(未入力)"}
👨‍🎨 作り手: ${makerLabel}`;

        await postToDiscord(content);
    } catch (e: any) {
        console.error("Discord notify failed (status update -> admin):", e?.message ?? e);
    }

    // 作り手Discordへ通知（replied / closed のときだけ）
    if ((nextStatus === "replied" || nextStatus === "closed") && makerWebhook) {
        try {
            const tag = nextStatus === "replied" ? "✅ 返信済み" : "🔒 クローズ";
            const content = `${tag}（作り手向け通知）
🕒 ${nowJST}
🧾 LeadID: ${before.id}

🏷 商品名: ${before.product_name ?? "(不明)"}
🔗 URL: ${before.product_url ?? "(なし)"}

👤 お客様: ${before.name ?? "(未入力)"}
✉️ Email: ${before.email ?? "(未入力)"}

管理画面でステータスが「${nextStatus}」になりました。`;

            await postToDiscordUrl(makerWebhook, content);
        } catch (e: any) {
            console.error("Discord notify failed (status update -> maker):", e?.message ?? e);
        }
    }

    revalidatePath("/admin/product-inquiries");
    revalidatePath(`/admin/product-inquiries/${id}`);
}
