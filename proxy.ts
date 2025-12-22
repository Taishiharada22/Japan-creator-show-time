// proxy.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const config = {
    matcher: ["/admin/:path*"],
};

function unauthorized() {
    return new NextResponse("Unauthorized", {
        status: 401,
        headers: {
            "WWW-Authenticate": 'Basic realm="Admin Area"',
        },
    });
}

export default function proxy(req: NextRequest) {
    const user = process.env.ADMIN_BASIC_USER ?? "";
    const pass = process.env.ADMIN_BASIC_PASS ?? "";

    // envが未設定ならローカルで詰むので、ここは明示的に止める
    if (!user || !pass) return unauthorized();

    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Basic ")) return unauthorized();

    try {
        const base64 = auth.slice("Basic ".length);
        const decoded = atob(base64); // "user:pass"
        const idx = decoded.indexOf(":");
        const u = idx >= 0 ? decoded.slice(0, idx) : "";
        const p = idx >= 0 ? decoded.slice(idx + 1) : "";

        if (u !== user || p !== pass) return unauthorized();
        return NextResponse.next();
    } catch {
        return unauthorized();
    }
}
