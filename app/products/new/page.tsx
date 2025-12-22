// app/products/new/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function NewProductPage() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const [titleJa, setTitleJa] = useState("");
    const [description, setDescription] = useState("");
    const [priceJpy, setPriceJpy] = useState<string>("");
    const [isExperience, setIsExperience] = useState(false);

    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        const boot = async () => {
            setLoading(true);
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                router.push("/login?next=/products/new");
                return;
            }
            setLoading(false);
        };
        boot();
    }, [router]);

    const handleCreate = async () => {
        setSaving(true);
        setError(null);
        setInfo(null);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setError("ログイン情報の取得に失敗しました。");
            setSaving(false);
            return;
        }

        if (!titleJa.trim()) {
            setError("タイトル（日本語）は必須です。");
            setSaving(false);
            return;
        }

        const priceNum = priceJpy.trim() === "" ? null : Number(priceJpy);
        if (priceNum !== null && Number.isNaN(priceNum)) {
            setError("価格は数字で入力してください。");
            setSaving(false);
            return;
        }

        // 1) まず products を作る（画像は後）
        const { data: created, error: createError } = await supabase
            .from("products")
            .insert({
                creator_id: user.id,
                title_ja: titleJa.trim(),
                description: description.trim() || null,
                price_jpy: priceNum,
                is_experience: isExperience,
                status: "public",
            })
            .select("id")
            .single();

        if (createError) {
            setError(
                `登録に失敗しました：${createError.message ?? "unknown error"}`
            );
            setSaving(false);
            return;
        }

        const productId = created?.id as string;

        // 2) 画像があるなら Storage にアップロード → products に image_path を保存
        if (file) {
            const safeName = file.name.replace(/[^\w.\-]+/g, "_");
            const path = `${user.id}/${productId}/${Date.now()}-${safeName}`;

            const { error: uploadError } = await supabase.storage
                .from("product-images")
                .upload(path, file, { upsert: true });

            if (uploadError) {
                setError(`画像アップロードに失敗しました：${uploadError.message}`);
                setSaving(false);
                return;
            }

            const { error: updateError } = await supabase
                .from("products")
                .update({ image_path: path })
                .eq("id", productId);

            if (updateError) {
                // image_path カラムが無い時はここで落ちる（PGRST204）
                setInfo(
                    "商品登録は成功しましたが、画像パスの保存に失敗しました。productsテーブルに image_path（text）を追加してください。"
                );
            }
        }

        setSaving(false);
        router.push(`/products/${productId}`);
    };

    if (loading) {
        return (
            <main className="max-w-2xl mx-auto px-4 py-10">
                <p>読み込み中…</p>
            </main>
        );
    }

    return (
        <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold">新規登録</h1>
                <p className="text-sm text-gray-600">
                    作品・体験を登録して、一覧/詳細に表示します。
                </p>
            </header>

            {(error || info) && (
                <div
                    className={`rounded-xl border p-4 text-sm ${error ? "text-red-600" : "text-gray-700"
                        } bg-white`}
                >
                    {error ?? info}
                </div>
            )}

            <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">
                        タイトル（日本語）*
                    </label>
                    <input
                        value={titleJa}
                        onChange={(e) => setTitleJa(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        placeholder="例：藍染ハンカチ / 藍染体験ワークショップ"
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-500 mb-1">説明</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm min-h-[120px]"
                        placeholder="短い説明 → 詳細ページでしっかり読ませる構成が強い"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <input
                        id="isExperience"
                        type="checkbox"
                        checked={isExperience}
                        onChange={(e) => setIsExperience(e.target.checked)}
                    />
                    <label htmlFor="isExperience" className="text-sm">
                        体験プラン（チェックON） / 物販（OFF）
                    </label>
                </div>

                <div>
                    <label className="block text-xs text-gray-500 mb-1">価格（円）</label>
                    <input
                        value={priceJpy}
                        onChange={(e) => setPriceJpy(e.target.value)}
                        className="w-40 rounded-xl border px-3 py-2 text-sm"
                        type="number"
                        min={0}
                        placeholder="例：5000"
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-500 mb-1">
                        サムネ画像（任意）
                    </label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        ※ 画像を表示したい場合、products に image_path（text）カラムが必要
                    </p>
                </div>

                <div className="flex gap-3 pt-2">
                    <button
                        onClick={handleCreate}
                        disabled={saving}
                        className="rounded-full bg-black text-white px-5 py-2 text-sm disabled:opacity-60"
                    >
                        {saving ? "登録中…" : "登録する"}
                    </button>
                    <button
                        onClick={() => router.push("/products")}
                        className="rounded-full border px-5 py-2 text-sm hover:bg-gray-50"
                    >
                        戻る
                    </button>
                </div>
            </section>
        </main>
    );
}
