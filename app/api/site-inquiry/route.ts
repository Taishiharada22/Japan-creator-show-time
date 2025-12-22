// app/api/site-inquiry/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 超簡易レート制限（小規模/ローカル向け）
const bucket = new Map<string, { count: number; resetAt: number }>();
function allow(ip: string, limit = 10, windowMs = 60_000) {
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

function isEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        // honeypot（hidden input "company"）
        const hp = String(body?.company ?? "").trim();
        if (hp) return NextResponse.json({ ok: true }, { status: 200 });

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

        const sourcePath = String(body?.source_path ?? "").trim() || "unknown";

        // ✅ DB保存（運営お問い合わせ：Discord通知なし）
        const { error: insErr } = await supabaseAdmin.from("site_inquiries").insert({
            name,
            email,
            message,
            status: "new",
            source_path: sourcePath,
            meta: { ip, ua, referer },
        });

        if (insErr) {
            console.error("insert site_inquiries failed:", insErr);
            return NextResponse.json({ ok: false, error: "failed to save (db)" }, { status: 500 });
        }

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (err: any) {
        console.error("POST /api/site-inquiry failed:", err?.message ?? err);
        return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
    }
}
