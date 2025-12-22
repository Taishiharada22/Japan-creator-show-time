// app/login/page.tsx
import { Suspense } from "react";
import LoginClient from "./LoginClient";

// オープンリダイレクト防止：必ず / から始まるパスだけ許可
function safeNextPath(input: string | null) {
    const fallback = "/account";
    if (!input) return fallback;
    if (!input.startsWith("/") || input.startsWith("//")) return fallback;
    if (/[\r\n]/.test(input)) return fallback;
    return input;
}

// ✅ login は静的化させない（ビルド時プリレンダー回避）
export const dynamic = "force-dynamic";

export default function LoginPage({
    searchParams,
}: {
    searchParams?: Record<string, string | string[] | undefined>;
}) {
    const raw = searchParams?.next;
    const nextStr = Array.isArray(raw) ? raw[0] : raw;
    const nextPath = safeNextPath(nextStr ?? null);

    return (
        <main className="mx-auto max-w-md px-4 py-10">
            {/* ✅ 念のため Suspense 境界も設置（CSR bailout対策） */}
            <Suspense fallback={<div className="text-sm text-gray-600">Loading...</div>}>
                <LoginClient nextPath={nextPath} />
            </Suspense>
        </main>
    );
}
