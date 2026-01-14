// lib/apiAuth.ts
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AuthError = "missing token" | "invalid session";

export async function getUserFromBearer(
    req: Request
): Promise<{ user: User; error: null } | { user: null; error: AuthError }> {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
        return { user: null, error: "missing token" };
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
        return { user: null, error: "invalid session" };
    }

    return { user: data.user, error: null };
}
