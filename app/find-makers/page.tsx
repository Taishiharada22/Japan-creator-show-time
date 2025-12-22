// app/find-makers/page.tsx
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import SiteInquiryForm from "../components/SiteInquiryForm";

export const dynamic = "force-dynamic";

type ProfileRow = {
    id: string;
    display_name: string | null;
    prefecture: string | null;
};

export default async function FindMakersPage() {
    const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, display_name, prefecture")
        .order("created_at", { ascending: false });

    if (error) {
        console.log("find-makers profile error", error);
    }

    const makers: ProfileRow[] = (profiles ?? []) as ProfileRow[];

    return (
        <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
            <div>
                <h1 className="text-3xl font-bold mb-4">日本文化の作り手を探す</h1>
                <p className="text-sm text-gray-700">
                    登録済みのクリエイター一覧です。名前をクリックすると詳細ページに移動します。
                </p>
            </div>

            {makers.length === 0 ? (
                <p>まだ登録された作り手がいません。</p>
            ) : (
                <ul className="space-y-4">
                    {makers.map((maker) => (
                        <li key={maker.id} className="border-b pb-3">
                            <Link
                                href={`/makers/${maker.id}`}
                                className="text-lg font-semibold text-blue-700 underline"
                            >
                                {maker.display_name || "名称未設定プロフィール"}
                            </Link>

                            <div className="text-sm text-gray-600 mt-1">
                                拠点：{maker.prefecture ? maker.prefecture : "未設定"}
                                import SiteInquiryForm from "../components/SiteInquiryForm";

                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* ✅ 運営者への問い合わせ（このページから送られたことが分かる） */}
            <SiteInquiryForm sourcePath="/find-makers" />

            <div className="pt-2">
                <Link href="/" className="text-sm text-blue-600 underline">
                    ホームに戻る
                </Link>
            </div>
        </main>
    );
}
