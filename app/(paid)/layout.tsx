// app/(paid)/layout.tsx
import { requireActiveSubscription } from "@/lib/requireActiveSubscription";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function PaidLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // ✅ ここはあなたの「ログイン中ユーザーIDの取得方法」に合わせて差し替え
    // 例：サーバーで userId を持ってる設計（cookies/headers）ならそれを使う
    // ここでは「一旦 placeholder」。すでにどこかで userId を取れてるはずなのでそこへ寄せて。
    const userId = ""; // ←ここをあなたの実装に合わせて埋める

    if (!userId) {
        // 未ログインならログインへ
        // redirect("/login");
        // 好みで
    } else {
        await requireActiveSubscription(userId);
    }

    return <>{children}</>;
}
