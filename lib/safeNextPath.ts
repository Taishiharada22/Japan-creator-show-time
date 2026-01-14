// lib/safeNextPath.ts
/**
 * open redirect 対策:
 * - / から始まる相対パスのみ許可
 * - // や http(s):// 等は拒否
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/") {
    if (!raw) return fallback;

    const s = String(raw).trim();

    // 絶対URL / プロトコル相対 / バックスラッシュは拒否
    if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//") || s.startsWith("\\")) {
        return fallback;
    }

    // 先頭が / じゃないのは拒否
    if (!s.startsWith("/")) return fallback;

    // 変な文字を軽く排除
    if (s.includes("\0")) return fallback;

    return s;
}
