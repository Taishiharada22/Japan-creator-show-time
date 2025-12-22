// lib/discord.ts
function sanitizeWebhookUrl(input: string) {
    return input
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1")
        .replace(
            "https://discordapp.com/api/webhooks/",
            "https://discord.com/api/webhooks/"
        );
}

async function postToDiscordUrl(url: string, content: string) {
    const safeUrl = sanitizeWebhookUrl(url);

    // Discord 2000文字制限
    const safe = content.length > 1900 ? content.slice(0, 1900) + "…" : content;

    const res = await fetch(safeUrl, {
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

// 運営通知（環境変数）
export async function postToDiscord(content: string) {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) throw new Error("DISCORD_WEBHOOK_URL is missing");
    return postToDiscordUrl(url, content);
}

// 作り手通知（URL直指定）
export async function postToDiscordDirect(url: string, content: string) {
    return postToDiscordUrl(url, content);
}
