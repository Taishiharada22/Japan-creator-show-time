// app/products/[id]/actions.ts
"use server";

import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifyDiscordInquiryCreated } from "@/lib/notifyDiscord";

export type InquiryResult = { ok: true } | { ok: false; error: string };

function isUuid(v: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        v
    );
}

function isEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function createInquiry(formData: FormData): Promise<InquiryResult> {
    const product_id = String(formData.get("product_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    // 🤖 honeypot（隠し項目が埋まってたらBOT扱いで成功扱いにして静かに捨てる）
    const company = String(formData.get("company") ?? "").trim();
    if (company) return { ok: true };

    if (!product_id || !isUuid(product_id))
        return { ok: false, error: "商品IDが不正です" };
    if (!name || name.length > 60)
        return { ok: false, error: "お名前を正しく入力してください" };
    if (!email || !isEmail(email) || email.length > 254)
        return { ok: false, error: "メールアドレスを正しく入力してください" };
    if (!message || message.length > 2000)
        return { ok: false, error: "内容は1〜2000文字で入力してください" };

    // product が存在し、公開されているかを確認（draftに送れないように）
    // ✅ 通知用に title_ja も取る
    const { data: p, error: pErr } = await supabaseAdmin
        .from("products")
        .select("id,status,title_ja")
        .eq("id", product_id)
        .maybeSingle();

    if (pErr) return { ok: false, error: "商品確認でエラーが発生しました" };
    if (!p) return { ok: false, error: "商品が見つかりません" };
    if (p.status && p.status !== "public")
        return { ok: false, error: "この商品は現在問い合わせできません" };

    // ✅ Next.js 16: headers() は await 必須
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = h.get("user-agent") ?? null;
    const referer = h.get("referer") ?? h.get("referrer") ?? null;

    // ✅ insertして inquiryId を回収
    const { data: inserted, error } = await supabaseAdmin
        .from("inquiries")
        .insert({
            product_id,
            name,
            email,
            message,
            status: "new",
            meta: { ip, ua, referer },
        })
        .select("id,created_at")
        .single();

    if (error) return { ok: false, error: "送信に失敗しました（DB）" };

    // ✅ Discord通知（失敗しても問い合わせは成功扱い）
    try {
        const site = process.env.NEXT_PUBLIC_SITE_URL;
        const adminUrl =
            site && inserted?.id ? `${site}/admin/inquiries/${inserted.id}` : undefined;

        await notifyDiscordInquiryCreated({
            inquiryId: inserted?.id,
            createdAt: inserted?.created_at,
            productId: product_id,
            productTitle: (p as any).title_ja ?? null,
            name,
            email,
            message,
            adminUrl,
        });
    } catch (e) {
        console.error("[createInquiry] discord notify error:", e);
    }

    return { ok: true };
}
