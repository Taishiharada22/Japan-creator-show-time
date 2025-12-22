// app/_actions/siteInquiry.ts
"use server";

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyDiscordSiteInquiryCreated } from "@/lib/notifyDiscord";

export type SiteInquiryResult = { ok: true } | { ok: false; error: string };

function isEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ✅ 受け付ける問い合わせ種別
const TOPIC_ALLOWED = new Set(["bug", "listing", "purchase", "business", "other"]);

// Discord表示用（ラベル）
function topicLabel(topic: string) {
    switch (topic) {
        case "bug":
            return "不具合の報告";
        case "listing":
            return "掲載・登録について";
        case "purchase":
            return "購入・配送について";
        case "business":
            return "取材・提携など";
        default:
            return "その他";
    }
}

export async function createSiteInquiry(formData: FormData): Promise<SiteInquiryResult> {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const source_path = String(formData.get("source_path") ?? "").trim() || null;

    // ✅ topic（未指定は other）
    const topicRaw = String(formData.get("topic") ?? "").trim();
    const topic = TOPIC_ALLOWED.has(topicRaw) ? topicRaw : "other";

    // 🤖 honeypot
    const company = String(formData.get("company") ?? "").trim();
    if (company) return { ok: true };

    if (!name || name.length > 60) return { ok: false, error: "お名前を正しく入力してください" };
    if (!email || !isEmail(email) || email.length > 254)
        return { ok: false, error: "メールアドレスを正しく入力してください" };
    if (!message || message.length > 3000)
        return { ok: false, error: "内容は1〜3000文字で入力してください" };

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = h.get("user-agent") ?? null;
    const referer = h.get("referer") ?? h.get("referrer") ?? null;

    // ✅ insertしてID回収（通知に使う）
    const { data: inserted, error } = await supabaseAdmin
        .from("site_inquiries")
        .insert({
            name,
            email,
            message,
            status: "new",
            source_path,
            meta: { ip, ua, referer, topic }, // ✅ topic を meta に入れる（MVP）
        })
        .select("id,created_at")
        .single();

    if (error) {
        console.error("[createSiteInquiry] insert error:", error);
        return { ok: false, error: "送信に失敗しました（DB）" };
    }

    // ✅ Discord通知（失敗しても送信成功扱い）
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    const adminUrl = site && inserted?.id ? `${site}/admin/site-inquiries/${inserted.id}` : undefined;

    await notifyDiscordSiteInquiryCreated({
        inquiryId: inserted?.id,
        createdAt: inserted?.created_at,
        sourcePath: source_path,
        topic,
        topicLabel: topicLabel(topic),
        name,
        email,
        message,
        adminUrl,
    });

    return { ok: true };
}
