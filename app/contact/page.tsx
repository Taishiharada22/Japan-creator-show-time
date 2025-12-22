// app/contact/page.tsx
import Link from "next/link";
import SiteInquiryForm from "@/app/components/SiteInquiryForm";

export const dynamic = "force-dynamic";

export default function ContactPage() {
    return (
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold">お問い合わせ</h1>
                <p className="text-sm text-gray-600">
                    掲載について / 不具合報告 / 取材の相談など、こちらからご連絡ください。
                </p>
                <div className="text-xs text-gray-500">
                    <Link className="underline" href="/">ホーム</Link> / お問い合わせ
                </div>
            </div>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
                <SiteInquiryForm sourcePath="/contact" />
            </section>

            <div className="pt-2">
                <Link href="/" className="text-sm underline">ホームへ戻る</Link>
            </div>
        </main>
    );
}
