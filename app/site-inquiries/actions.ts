// app/site-inquiries/actions.ts
"use server";

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { postToDiscord } from "@/lib/discord";

export type SiteInquiryResult = { ok: true } | { ok: false; error: string };

function isEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeBaseUrl(u: string) {
    return u.replace(/\/+$/, "");
}

async function getBaseUrlFromHeaders(): Promise<string> {
    // 1) 明示URL（本番はここを推奨）
    const env =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

    if (env) return normalizeBaseUrl(env);

    // 2) リクエストヘッダーから推測（ローカル/プレビュー用）
    try {
        const h = await headers();
        const proto = h.get("x-forwarded-proto") ?? "http";
        const host = h.get("x-forwarded-host") ?? h.get("host");
        if (host) return normalizeBaseUrl(`${proto}://${host}`);
    } catch { }

    // 3) フォールバック
    return "http://localhost:3000";
}

export async function createSiteInquiry(formData: FormData): Promise<SiteInquiryResult> {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    // ✅ どのページから来たか
    const source_path = String(formData.get("source_path") ?? "").trim() || null;

    // honeypot（bot対策：入ってたら成功扱いで捨てる）
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

    // 1) DBに保存（主）
    const { data: inserted, error } = await supabaseAdmin
        .from("site_inquiries")
        .insert({
            name,
            email,
            message,
            status: "new",
            meta: { ip, ua, referer, source_path },
        })
        .select("id")
        .maybeSingle();

    if (error) return { ok: false, error: "送信に失敗しました（DB）" };

    const leadId = inserted?.id ?? "";
    const nowJST = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    // 2) Discord通知（失敗してもDBには入ってるので成功返し）
    try {
        const baseUrl = await getBaseUrlFromHeaders();
        const adminDetailUrl = leadId ? `${baseUrl}/admin/site-inquiries/${leadId}` : "(不明)";
        const adminListUrl = `${baseUrl}/admin/site-inquiries?status=new`;

        const content = `📩 サイト問い合わせ（DB保存済み）
🕒 ${nowJST}
🧾 LeadID: ${leadId || "(unknown)"}

🔎 管理画面（詳細）: ${adminDetailUrl}
📚 管理画面（一覧）: ${adminListUrl}

👤 名前: ${name}
✉️ Email: ${email}
📍 送信元: ${source_path ?? "(不明)"}
🌐 IP: ${ip ?? "(不明)"}
🖥 UA: ${ua ?? "(不明)"}
🔗 Referer: ${referer ?? "(不明)"}

📝 内容:
${message}`;

        await postToDiscord(content);
    } catch (e: any) {
        console.error("Discord notify failed (site inquiry):", e?.message ?? e);
    }

    return { ok: true };
}
