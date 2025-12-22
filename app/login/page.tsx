// app/login/page.tsx
import LoginClient from "./LoginClient";

function safeNextPath(input: string | null) {
    // オープンリダイレクト防止：必ず / から始まるパスだけ許可
    if (!input) return "/account";
    if (!input.startsWith("/")) return "/account";
    return input;
}

type SP = Record<string, string | string[] | undefined>;

export default async function LoginPage({
    searchParams,
}: {
    // Next 16 では Promise になるケースがあるので両対応
    searchParams?: SP | Promise<SP>;
}) {
    const sp = await Promise.resolve(searchParams ?? {});
    const raw = sp?.next;
    const nextStr = Array.isArray(raw) ? raw[0] : raw;
    const nextPath = safeNextPath(nextStr ?? null);

    return (
        <main className="mx-auto max-w-md p-6">
            <LoginClient nextPath={nextPath} />
        </main>
    );
}
