// app/_debug/env/page.tsx
export const dynamic = "force-dynamic";

export default function DebugEnvPage() {
    return (
        <main style={{ padding: 24, fontFamily: "monospace" }}>
            <div>cwd: {process.cwd()}</div>
            <hr style={{ margin: "12px 0" }} />
            <div>NEXT_PUBLIC_SUPABASE_URL: {String(process.env.NEXT_PUBLIC_SUPABASE_URL)}</div>
            <div>
                NEXT_PUBLIC_SUPABASE_ANON_KEY:{" "}
                {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "set" : "missing"}
            </div>
        </main>
    );
}
