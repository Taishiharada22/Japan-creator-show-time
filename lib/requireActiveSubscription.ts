// lib/requireActiveSubscription.ts
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function requireActiveSubscription(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1);

    if (error) {
        console.error("subscription read error:", error);
        redirect("/pricing");
    }

    const status = data?.[0]?.status ?? null;
    if (status !== "active") {
        redirect("/pricing");
    }
}
