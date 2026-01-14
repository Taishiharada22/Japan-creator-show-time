// proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function buildLoginRedirect(req: NextRequest) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // login 側が next を読む想定
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
}

// ✅ Next.js 16: middleware() じゃなく proxy() にする
export async function proxy(req: NextRequest) {
    const res = NextResponse.next();

    // 保険：API は触らない（Webhook等に影響させない）
    if (req.nextUrl.pathname.startsWith("/api/")) return res;

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        res.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    // 1) ログイン必須（保護対象のページに入ってきた時点で）
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user ?? null;

    if (userErr) console.error("proxy auth.getUser error:", userErr);

    if (!user) {
        return buildLoginRedirect(req);
    }

    // 2) /admin 配下だけ “admin ロール必須”
    if (req.nextUrl.pathname.startsWith("/admin")) {
        const { data: profile, error: profErr } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

        if (profErr) {
            console.error("proxy profiles read error:", profErr);
            const url = req.nextUrl.clone();
            url.pathname = "/";
            return NextResponse.redirect(url);
        }

        if (profile?.role !== "admin") {
            const url = req.nextUrl.clone();
            url.pathname = "/";
            return NextResponse.redirect(url);
        }
    }

    return res;
}

export const config = {
    matcher: [
        "/admin/:path*",
        "/dashboard/:path*",
        "/subscription/:path*",
        "/my/:path*",
        "/products/new",
    ],
};
