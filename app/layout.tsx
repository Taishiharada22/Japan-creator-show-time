// app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Japan Culture MVP",
  description: "日本文化クリエイターと、世界のファンをつなぐプラットフォーム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {/* ★ ここだけ残す：共通ヘッダー */}
        <header className="border-b">
          <nav
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              fontSize: 14,
            }}
          >
            <Link href="/">Home</Link>
            <Link href="/find-makers">Find Makers</Link>
            <Link href="/product-search">Product Search</Link>
            <Link href="/match">Match</Link>
            <Link href="/subscription">Subscription</Link> {/* ←これだけ残す */}
            <Link href="/my">My Page</Link>
            <Link href="/dashboard">Creator Dashboard</Link>
            <Link href="/login">Login</Link>
            <Link href="/admin" className="text-sm underline">
              admin
            </Link>
            <Link href="/contact">問い合わせ</Link>


          </nav>

        </header>

        {/* ページ本体 */}
        <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
