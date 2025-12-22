"use client";

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
    userId: string;
    bucket?: string; // default: "product-images"
    folder?: string; // default: "products"
    value?: string | null; // 既にアップ済みの storage path
    onChange?: (path: string | null) => void; // storage path を親に返す
};

export default function ProductImageUploader({
    userId,
    bucket = "product-images",
    folder = "products",
    value = null,
    onChange,
}: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const currentPublicUrl = useMemo(() => {
        if (!value) return null;
        const { data } = supabase.storage.from(bucket).getPublicUrl(value);
        return data.publicUrl || null;
    }, [bucket, value]);

    const shownUrl = previewUrl || currentPublicUrl;

    const openPicker = () => inputRef.current?.click();

    const genFileName = (originalName: string) => {
        const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
        const rand =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2);
        return `${Date.now()}-${rand}.${ext}`;
    };

    const handleFile = async (file: File) => {
        setError(null);

        // 簡単なバリデーション
        if (!file.type.startsWith("image/")) {
            setError("画像ファイルを選択してください。");
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            setError("画像サイズが大きすぎます（8MB以下にしてください）。");
            return;
        }

        setUploading(true);

        try {
            // 例: products/<uid>/<filename>
            const path = `${folder}/${userId}/${genFileName(file.name)}`;

            const { error: upErr } = await supabase.storage
                .from(bucket)
                // upsert: false にして「UPDATE権限」を不要にする（INSERTだけで済む）
                .upload(path, file, { upsert: false, contentType: file.type });

            if (upErr) throw upErr;

            // プレビュー（Bucketがpublicなら見える）
            const { data } = supabase.storage.from(bucket).getPublicUrl(path);
            setPreviewUrl(data.publicUrl || null);

            onChange?.(path);
        } catch (e: any) {
            console.error("upload error", e);
            setError(e?.message ?? "アップロードに失敗しました。");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={openPicker}
                    disabled={uploading}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                    {uploading ? "アップロード中…" : "画像を選択"}
                </button>

                {value && (
                    <button
                        type="button"
                        onClick={() => {
                            setPreviewUrl(null);
                            onChange?.(null);
                        }}
                        disabled={uploading}
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                    >
                        画像を外す
                    </button>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) {
                        handleFile(f);
                    }
                    // 同じファイルを選び直せるように
                    e.currentTarget.value = "";
                }}
            />

            {shownUrl && (
                <div className="rounded-xl border p-3">
                    <p className="text-xs text-gray-500 mb-2">プレビュー</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={shownUrl}
                        alt="preview"
                        className="w-full max-w-md rounded-lg object-cover"
                    />
                </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <p className="text-xs text-gray-500">
                ※ 保存先: <code>{bucket}</code> / <code>{folder}/{userId}/...</code>
            </p>
        </div>
    );
}
