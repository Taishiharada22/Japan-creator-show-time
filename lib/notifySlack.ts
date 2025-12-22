// lib/notifySlack.ts
type InquiryNotifyPayload = {
    inquiryId?: string;
    createdAt?: string;
    productId: string;
    productTitle?: string | null;
    name: string;
    email: string;
    message: string;
    adminUrl?: string;
};

function clip(s: string, max = 1200) {
    if (!s) return s;
    return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function notifySlackInquiryCreated(p: InquiryNotifyPayload) {
    const url = process.env.SLACK_WEBHOOK_URL;

    // ✅ 切り分け用ログ
    console.log("[slack] webhook set?", !!url);

    if (!url) return;

    const title = p.productTitle ? `${p.productTitle}` : p.productId;

    const text =
        `🆕 新しい問い合わせ\n` +
        `商品: ${title}\n` +
        `名前: ${p.name}\n` +
        `Email: ${p.email}\n` +
        `内容:\n${clip(p.message)}` +
        (p.adminUrl ? `\n管理画面: ${p.adminUrl}` : "");

    try {
        console.log("[slack] sending...");
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error("Slack notify failed:", res.status, body);
        } else {
            console.log("[slack] ok");
        }
    } catch (e) {
        console.error("Slack notify error:", e);
    }
}
