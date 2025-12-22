// app/api/inquiry/route.ts
import { NextResponse } from "next/server";
import { postToDiscord } from "@/lib/discord";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 超簡易レート制限（小規模/ローカル向け）
// ※サーバレス本番で強くしたいならUpstash等へ移行
const bucket = new Map<string, { count: number; resetAt: number }>();
function allow(ip: string, limit = 5, windowMs = 60_000) {
    const now = Date.now();
    const cur = bucket.get(ip);
    if (!cur || now > cur.resetAt) {
        bucket.set(ip, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (cur.count >= limit) return false;
    cur.count += 1;
    return true;
}

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

function isEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeBaseUrl(u: string) {
    return u.replace(/\/+$/, "");
}

function getBaseUrlFromRequest(req: Request): string {
    const env =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

    if (env) return normalizeBaseUrl(env);

    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
    return normalizeBaseUrl(`${proto}://${host}`);
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        // honeypot（hidden input "company"）
        const hp = String(body?.company ?? "").trim();
        if (hp) return NextResponse.json({ ok: true }, { status: 200 });

        // 商品問い合わせ専用
        const kind = String(body?.kind ?? "product");
        if (kind !== "product") {
            return NextResponse.json({ ok: false, error: "invalid kind" }, { status: 400 });
        }

        const name = String(body?.name ?? "").trim();
        const email = String(body?.email ?? "").trim();
        const message = String(body?.message ?? "").trim();

        if (!name || name.length > 60) {
            return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
        }
        if (!email || !isEmail(email) || email.length > 254) {
            return NextResponse.json({ ok: false, error: "email is invalid" }, { status: 400 });
        }
        if (!message || message.length > 3000) {
            return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
        }

        const ua = req.headers.get("user-agent") ?? "";
        const rawIp = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
        const ip = rawIp.split(",")[0]?.trim() || rawIp;
        const referer = req.headers.get("referer") ?? req.headers.get("referrer") ?? "";

        if (!allow(ip)) {
            return NextResponse.json({ ok: false, error: "too many requests" }, { status: 429 });
        }

        const nowJST = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
        const baseUrl = getBaseUrlFromRequest(req);

        // フォームから渡す想定
        const productName = String(body?.productName ?? "").trim();
        const productUrl = String(body?.productUrl ?? "").trim() || referer;
        const makerId = String(body?.makerId ?? "").trim() || null; // MVPでは null でもOK
        const sourcePath = String(body?.source_path ?? "").trim() || null;

        // ① DB保存（主）
        const { data: inserted, error: insErr } = await supabaseAdmin
            .from("product_inquiries")
            .insert({
                name,
                email,
                message,
                status: "new",
                product_name: productName || null,
                product_url: productUrl || null,
                maker_id: makerId,
                source_path: sourcePath,
                meta: { ip, ua, referer },
            })
            .select("id, status")
            .maybeSingle();

        if (insErr) {
            console.error("insert product_inquiries failed:", insErr);
            return NextResponse.json({ ok: false, error: "failed to save (db)" }, { status: 500 });
        }

        const leadId = inserted?.id ?? "(unknown)";
        const adminDetailUrl = `${baseUrl}/admin/product-inquiries/${leadId}`;
        const adminListUrl = `${baseUrl}/admin/product-inquiries`;

        // ② 運営Discord通知（失敗してもDB保存済みなので success 返す）
        try {
            const content = `📩 商品問い合わせ（DB保存済み）
🕒 ${nowJST}
🧾 LeadID: ${leadId}

🔎 管理画面（詳細）: ${adminDetailUrl}
📚 管理画面（一覧）: ${adminListUrl}

👤 名前: ${name}
✉️ Email: ${email}
👨‍🎨 maker_id: ${makerId ?? "(なし)"}
📍 送信元: ${sourcePath ?? "(不明)"}
🌐 IP: ${ip}
🖥 UA: ${ua}

🏷 商品名: ${productName || "(不明)"}
🔗 URL: ${productUrl || "(なし)"}

📝 内容:
${message}`;

            await postToDiscord(content);
        } catch (e: any) {
            console.error("Discord notify failed (admin):", e?.message ?? e);
        }

        // ③ 作り手Discordへ転送（webhookがあれば）
        // ※ maker 機能は一旦スキップ方針でもOK。makerIdがなければ何もしない。
        if (makerId) {
            try {
                const { data: maker } = await supabaseAdmin
                    .from("makers")
                    .select("display_name, notify_discord_webhook_url")
                    .eq("id", makerId)
                    .maybeSingle();

                const webhook = (maker?.notify_discord_webhook_url ?? "").trim();
                const makerName = (maker?.display_name ?? "").trim() || makerId;

                if (webhook) {
                    const content = `🛒 商品問い合わせ（作り手向け転送）
🕒 ${nowJST}
🧾 LeadID: ${leadId}
👨‍🎨 作り手: ${makerName}

👤 お客様: ${name}
✉️ Email: ${email}

🏷 商品名: ${productName || "(不明)"}
🔗 URL: ${productUrl || "(なし)"}

📝 内容:
${message}`;

                    await postToDiscordUrl(webhook, content);

                    // forwarded に更新（転送できた印）
                    await supabaseAdmin.from("product_inquiries").update({ status: "forwarded" }).eq("id", leadId);
                }
            } catch (e: any) {
                console.error("forward to maker failed:", e?.message ?? e);
            }
        }

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (err: any) {
        console.error("POST /api/inquiry failed:", err?.message ?? err);
        return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
    }
}
