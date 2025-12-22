"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "コピー",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      // 失敗時は何もしない（必要ならalertでもOK）
      console.error("copy failed:", e);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`rounded-xl border px-3 py-2 text-xs hover:bg-gray-50 ${className}`}
    >
      {copied ? "コピーしました" : label}
    </button>
  );
}
