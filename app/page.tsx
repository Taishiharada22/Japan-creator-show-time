// app/page.tsx
import Link from "next/link";
import SiteInquiryForm from "./components/SiteInquiryForm";

export default function HomePage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold">Japan Culture MVP（試作版）</h1>
        <p className="text-lg">
          日本の職人さん・クリエイターの作品や体験を、
          海外の人が見つけやすくするためのテストサイトです。
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">主なページ</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <Link href="/find-makers" className="text-blue-600 underline">
              日本文化の作り手を探す（Find Makers）
            </Link>
          </li>

          <li>
            <Link href="/search-products" className="text-blue-600 underline">
              プロダクト検索（体験・物販を絞り込む）
            </Link>
          </li>

          <li>
            <Link href="/dashboard" className="text-blue-600 underline">
              クリエイター用マイページ（Creator Dashboard）
            </Link>{" "}
            <span className="text-sm text-gray-600">
              ※ ログインしているクリエイター向け
            </span>
          </li>

          <li>
            <Link href="/login" className="text-blue-600 underline">
              ログイン / サインアップ
            </Link>
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm text-gray-600">
        <p>
          このMVPでは、まず「作品一覧」と「作り手のプロフィール表示」に絞って実装しています。
        </p>
        <p>
          将来的には、写真ギャラリー・動画・多言語対応・決済などを追加していく想定です。
        </p>
      </section>

      {/* ✅ 運営者への問い合わせ（Homeから送れる） */}
      <section className="pt-2">
        <SiteInquiryForm sourcePath="/" />
      </section>
    </main>
  );
}
