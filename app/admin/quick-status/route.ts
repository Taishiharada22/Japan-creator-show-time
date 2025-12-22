// app/admin/quick-status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

const ALLOWED = new Set(["new", "in_progress", "done"]);

function s(v: FormDataEntryValue | null) {
    return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
    const fd = await req.formData();

    const kind = s(fd.get("kind")); // "product" | "site"
    const id = s(fd.get("id"));
    const status = s(fd.get("status"));

    if (!id || !ALLOWED.has(status) || (kind !== "product" && kind !== "site")) {
        return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
    }

    const table = kind === "product" ? "inquiries" : "site_inquiries";

    const { error } = await supabaseAdmin.from(table).update({ status }).eq("id", id);
    if (error) {
        console.error("[quick-status] update error:", error);
        // 失敗しても戻す（MVP優先）
    }

    // 画面更新
    revalidatePath("/admin");
    revalidatePath(kind === "product" ? "/admin/inquiries" : "/admin/site-inquiries");
    revalidatePath(kind === "product" ? `/admin/inquiries/${id}` : `/admin/site-inquiries/${id}`);

    // 元の画面へ戻す（open redirect対策あり）
    const origin = new URL(req.url).origin;
    const ref = req.headers.get("referer") || `${origin}/admin`;

    let back = new URL("/admin", origin);
    try {
        const u = new URL(ref);
        back = u.origin === origin ? u : new URL("/admin", origin);
    } catch {
        back = new URL("/admin", origin);
    }

    return NextResponse.redirect(back, { status: 303 });
}
