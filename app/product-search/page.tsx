// app/product-search/page.tsx
import { Suspense } from "react";
import ProductSearchClient from "./ProductSearchClient";

export const dynamic = "force-dynamic";

export default function ProductSearchPage() {
    return (
        <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-10">Loading...</main>}>
            <ProductSearchClient />
        </Suspense>
    );
}
