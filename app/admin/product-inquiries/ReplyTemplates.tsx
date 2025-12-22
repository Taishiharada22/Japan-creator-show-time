"use client";

import CopyButton from "./CopyButton";

function enc(s: string) {
    return encodeURIComponent(s);
}

export default function ReplyTemplates(props: {
    name?: string | null;
    email?: string | null;
    productName?: string | null;
    productUrl?: string | null;
    message?: string | null;
}) {
    const name = (props.name ?? "").trim() || "お客様";
    const email = (props.email ?? "").trim();
    const productName = (props.productName ?? "").trim() || "商品";
    const productUrl = (props.productUrl ?? "").trim();
    const msg = props.message ?? "";

    const isExperience = msg.includes("種別：体験プラン");

    const subject = isExperience
        ? `【Japan Culture MVP】体験プランお問い合わせありがとうございます（${productName}）`
        : `【Japan Culture MVP】商品お問い合わせありがとうございます（${productName}）`;

    const base = `お問い合わせありがとうございます。${name}様

「${productName}」について、内容を確認いたしました。

`;

    const askMore = isExperience
        ? `【確認したいこと】
1) 希望日（第1〜第3希望）
2) 人数
3) 希望時間帯（午前/午後/夕方以降 など）
4) 対応言語（日本語/English）

わかる範囲でご返信ください。`
        : `【確認したいこと】
1) 数量
2) 配送先（国内/海外）
3) （海外の場合）国名・都市
4) 希望納期（あれば）

わかる範囲でご返信ください。`;

    const nextStep = isExperience
        ? `【次のご案内】
空き状況を確認し、候補日時をご提案します。`
        : `【次のご案内】
在庫・送料・納期の目安を確認し、ご案内します。`;

    const footer = `

（運営）Japan Culture MVP
${productUrl ? `商品URL: ${productUrl}\n` : ""}`.trimEnd();

    const tpl1 = `${base}${nextStep}\n\n${askMore}${footer}`;
    const tpl2 = `${base}ご質問ありがとうございます。\n\n${askMore}${footer}`;

    const tpl3 = isExperience
        ? `${base}【候補日時のご提案】\n・候補1：\n・候補2：\n・候補3：\n\n上記でご都合いかがでしょうか？${footer}`
        : `${base}【お見積りの前提確認】\n・数量：\n・配送先：国内/海外\n・国/都市：\n\n上記をいただければ、送料と合計目安をご案内します。${footer}`;

    const mailto = email
        ? `mailto:${enc(email)}?subject=${enc(subject)}&body=${enc(tpl1)}`
        : "";

    return (
        <section className="rounded-2xl border bg-white p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">返信テンプレ</h2>
                {mailto ? (
                    <a className="text-xs underline text-blue-700" href={mailto}>
                        メール作成を開く
                    </a>
                ) : (
                    <span className="text-xs text-gray-500">※ Email未入力</span>
                )}
            </div>

            <div className="grid gap-3">
                <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold">① 受付完了＋追加確認</div>
                        <CopyButton text={tpl1} label="コピー" />
                    </div>
                    <pre className="text-xs whitespace-pre-wrap leading-5">{tpl1}</pre>
                </div>

                <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold">② 追加確認だけ（短め）</div>
                        <CopyButton text={tpl2} label="コピー" />
                    </div>
                    <pre className="text-xs whitespace-pre-wrap leading-5">{tpl2}</pre>
                </div>

                <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold">
                            ③ {isExperience ? "候補日時の提案" : "送料/合計の前提確認"}
                        </div>
                        <CopyButton text={tpl3} label="コピー" />
                    </div>
                    <pre className="text-xs whitespace-pre-wrap leading-5">{tpl3}</pre>
                </div>
            </div>
        </section>
    );
}
