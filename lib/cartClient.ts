// lib/cartClient.ts
export type Cart = {
    id: string;
    user_id: string;
    status: string;
    currency: string;
    stripe_checkout_session_id?: string | null;
    checkout_started_at?: string | null;
    created_at?: string;
    updated_at?: string;
};

export type CartItem = {
    id: string;
    cart_id: string;
    product_id: string;
    quantity: number;
    unit_amount: number;
    currency: string;
    title: string;
    created_at?: string;
    updated_at?: string;
};

export type CartResponse = {
    cart: Cart | null;
    items: CartItem[];
};

type ApiError = { error: string };

async function readJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!text) return {} as T;
    try {
        return JSON.parse(text) as T;
    } catch {
        // JSONじゃなかった場合（エラーHTMLなど）
        throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
}

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const res = await fetch(input, {
        ...init,
        headers: {
            "content-type": "application/json",
            ...(init?.headers ?? {}),
        },
        // 念のため（同一オリジンなら default でもOK）
        credentials: "include",
        cache: "no-store",
    });

    if (!res.ok) {
        const data = await readJson<ApiError>(res).catch(() => null);
        const msg =
            data?.error ||
            `${res.status} ${res.statusText || "Request failed"} (${String(input)})`;
        throw new Error(msg);
    }

    return await readJson<T>(res);
}

// ===== Cart =====
export async function getCart(): Promise<CartResponse> {
    return api<CartResponse>("/api/cart", { method: "GET" });
}

export async function clearCart(): Promise<CartResponse> {
    return api<CartResponse>("/api/cart", { method: "DELETE" });
}

// ===== Cart Items =====
export async function addToCart(params: {
    productId: string;
    quantity: number;
    op?: "add" | "set";
}): Promise<CartResponse> {
    return api<CartResponse>("/api/cart/items", {
        method: "POST",
        body: JSON.stringify(params),
    });
}

export async function setCartItemQty(params: {
    productId: string;
    quantity: number; // 0以下で削除
}): Promise<CartResponse> {
    return api<CartResponse>("/api/cart/items", {
        method: "PATCH",
        body: JSON.stringify(params),
    });
}

export async function removeFromCart(productId: string): Promise<CartResponse> {
    // NOTE: DELETE body を嫌う環境があるので、問題出たら POST /remove に切り替える
    return api<CartResponse>("/api/cart/items", {
        method: "DELETE",
        body: JSON.stringify({ productId }),
    });
}

// ===== Checkout =====
export async function startCheckout(params?: {
    cartId?: string;
    successPath?: string;
    cancelPath?: string;
}): Promise<{ url: string }> {
    return api<{ url: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify(params ?? {}),
    });
}
