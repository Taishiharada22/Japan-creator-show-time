// app/login/page.tsx
import { safeNextPath } from "@/lib/safeNextPath";
import LoginForm from "./LoginForm";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams;

    const raw = sp?.next;
    const nextStr = Array.isArray(raw) ? raw[0] : raw;
    const nextPath = safeNextPath(nextStr ?? null, "/");

    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <h1 className="text-3xl font-extrabold tracking-tight">Login</h1>

            {/* デバッグ表示（不要なら消してOK） */}
            <p className="mt-2 text-sm text-gray-600">next: {nextPath}</p>

            <div className="mt-6">
                <LoginForm nextPath={nextPath} />
            </div>
        </main>
    );
}
