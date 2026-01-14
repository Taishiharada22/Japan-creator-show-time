// app/_components/Nav.tsx
import Link from "next/link";

export default function Nav() {
    return (
        <header className="border-b">
            <nav className="flex gap-4 items-center text-sm px-4 py-3">
                <Link href="/">Home</Link>
                <Link href="/find-makers">Find Makers</Link>
                <Link href="/product-search">Product Search</Link>
                <Link href="/match">Match</Link>
                <Link href="/subscription">Subscription</Link>
                <Link href="/my">My Page</Link>
                <Link href="/dashboard">Creator Dashboard</Link>
                <Link href="/login">Login</Link>

                {/* 公開サイトなら admin は基本消すのがおすすめ */}
                {process.env.NODE_ENV !== "production" && (
                    <Link href="/admin" className="underline">
                        admin
                    </Link>
                )}

                <Link href="/contact">問い合わせ</Link>
            </nav>
        </header>
    );
}
