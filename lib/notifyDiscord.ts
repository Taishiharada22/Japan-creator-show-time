// lib/notifyDiscord.ts

type ProductInquiryPayload = {
    inquiryId?: string;
    createdAt?: string;
    productId: string;
    productTitle?: string | null;
    name: string;
    email: string;
    message: string;
    adminUrl?: string;
};

type SiteInquiryPayload = {
    inquiryId?: string;
    createdAt?: string;
    sourcePath?: string | null;

    // ✅ 追加（siteInquiry.ts から渡せるように）
    topic?: string;      // "bug" | "listing" | "purchase" | "business" | "other"
    topicLabel?: string; // "不具合の報告" など

    name: string;
    email: string;
    message: string;
    adminUrl?: string;
};

function trunc(s: string, max: number) {
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + "…";
}

function safeLine(label: string, value: string | null | undefined) {
    const v = (value ?? "").toString().trim();
    return `${label} ${v.length ? v : "-"}`;
}

async function postDiscord(webhookUrl: string, content: string, tag: string) {
    // Discord: content <= 2000
    const body = {
        content: trunc(content, 1900),
        allowed_mentions: { parse: [] as string[] }, // @everyone 等を防ぐ
    };

    const url = webhookUrl.includes("?") ? webhookUrl : `${webhookUrl}?wait=true`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // next dev でも動くけど一応明示
        cache: "no-store",
    });

    const text = await res.text().catch(() => "");

    if (!res.ok) {
        console.error(`[discord:${tag}] failed status=${res.status} body=${text}`);
        return;
    }

    console.log(`[discord:${tag}] ok status=${res.status}`);
}

export async function notifyDiscordInquiryCreated(p: ProductInquiryPayload) {
    const webhook = process.env.DISCORD_PRODUCT_INQUIRY_WEBHOOK_URL;
    if (!webhook) {
        console.warn(
            "[discord:product] webhook missing (DISCORD_PRODUCT_INQUIRY_WEBHOOK_URL)"
        );
        return;
    }

    const lines = [
        "✅ 新しい「商品問い合わせ」",
        safeLine("・Inquiry:", p.inquiryId),
        safeLine("・日時:", p.createdAt),
        safeLine("・商品:", p.productTitle ?? p.productId),
        safeLine("・名前:", p.name),
        safeLine("・メール:", p.email),
        safeLine("・管理URL:", p.adminUrl),
        "",
        "内容:",
        trunc(p.message, 900),
    ];

    await postDiscord(webhook, lines.join("\n"), "product");
}

export async function notifyDiscordSiteInquiryCreated(p: SiteInquiryPayload) {
    const webhook = process.env.DISCORD_SITE_INQUIRY_WEBHOOK_URL;
    if (!webhook) {
        console.warn(
            "[discord:site] webhook missing (DISCORD_SITE_INQUIRY_WEBHOOK_URL)"
        );
        return;
    }

    // ✅ topic が来てれば表示（未対応でも壊れない）
    const topicLine =
        p.topic || p.topicLabel
            ? `・種別: ${(p.topicLabel ?? "").trim() || "—"}${p.topic ? ` (${p.topic})` : ""
            }`
            : null;

    const lines = [
        "✅ 新しい「運営お問い合わせ」",
        safeLine("・Inquiry:", p.inquiryId),
        safeLine("・日時:", p.createdAt),
        safeLine("・送信元:", p.sourcePath ?? "-"),
        topicLine,
        safeLine("・名前:", p.name),
        safeLine("・メール:", p.email),
        safeLine("・管理URL:", p.adminUrl),
        "",
        "内容:",
        trunc(p.message, 900),
    ].filter(Boolean) as string[];

    await postDiscord(webhook, lines.join("\n"), "site");
}
