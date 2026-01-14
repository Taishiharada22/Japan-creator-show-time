import Link from "next/link";

export default function About() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-14 space-y-6">
      <h1 className="text-3xl font-bold">Taishi Culture</h1>
      <p className="text-gray-700">
        日本の文化・商品を海外向けに販売するプラットフォームです。
      </p>

      <section className="space-y-2 text-sm text-gray-700">
        <p><b>提供内容</b>：商品販売 / デジタルサービス / サブスクリプション（必要に応じて編集）</p>
        <p><b>連絡先</b>：ここにメールアドレス</p>
      </section>

      <div className="flex gap-4 text-sm">
        <Link className="underline" href="/terms">利用規約</Link>
        <Link className="underline" href="/privacy">プライバシーポリシー</Link>
        <Link className="underline" href="/refund">返金/キャンセル</Link>
      </div>

      <div className="flex gap-3">
        <Link className="rounded-xl bg-black text-white px-4 py-2" href="/products">
          商品を見る
        </Link>
        <Link className="rounded-xl border px-4 py-2" href="/login">
          ログイン
        </Link>
      </div>
    </main>
  );
}
