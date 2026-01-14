// app/api/debug/stripe/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
    return NextResponse.json({
        hasKey: !!key,
        prefix: key ? key.slice(0, 8) : null,
        isLive: key.startsWith("sk_live_"),
        isTest: key.startsWith("sk_test_"),
    });
}
