// app/login/page.tsx
import LoginClient from "./LoginClient";

function safeNextPath(input: string | null) {
    // オープンリダイレクト防止：必ず「/」で始まる内部パスのみ許可
    const fallback = "/account";
    if (!input) return fallback;

    // protocol-relative (//evil.com) を弾く
    if (!input.startsWith("/") || input.startsWith("//")) return fallback;

    // 念のため改行なども弾く
    if (/[\r\n]/.test(input)) return fallback;

    return input;
}

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
            <LoginClient nextPath={nextPath} />
        </main>
    );
}
