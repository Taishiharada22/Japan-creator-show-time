// app/search-products/page.tsx
import { Suspense } from "react";
import ProductSearchClient from "../product-search/ProductSearchClient";

export const dynamic = "force-dynamic";

export default function SearchProductsPage() {
    return (
        <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-10">Loading...</main>}>
            <ProductSearchClient />
        </Suspense>
    );
}
