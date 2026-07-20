# レシート読み込みツール（Google Vision OCR）

レシート画像をまとめて Google Cloud Vision API で OCR し、明細行の表にして CSV 出力する個人利用ツールです。家計簿集計ツール（MoneyForward ME）とは別画面で、突合は次バージョン予定です。

**注意:** レシート画像は OCR のため Google に送信されます。APIキーはこの端末のブラウザ `localStorage` にだけ保存します（リポジトリやサーバーには置きません）。

## 使い方（ブラウザ）

```bash
npm install
cp .env.example .env   # GOOGLE_CLIENT_ID を設定（家計簿ツールと同じ）
npm run receipts
```

ブラウザで http://localhost:1236/receipts.html を開きます。

1. **Googleログイン** — 家計簿ツールと同じ許可リストのアカウントでログインします。
2. **Vision APIキーを保存** — 画面にキーを貼り付けて「保存」。このブラウザの localStorage に保存されます。
3. **レシート画像を読み込む** — JPEG / PNG / WebP / GIF を複数選択（ドラッグ＆ドロップ可）。
4. **表を確認・編集** — OCR結果の明細行を画面上で修正できます。
5. **CSVをダウンロード** — UTF-8（BOM付き）で保存されます。

## Google Cloud Vision の準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 請求先アカウントを紐づける（無料枠利用にもカード登録が必要）
3. **Cloud Vision API** を有効化
4. **APIキー**を作成し、次を推奨:
   - **アプリケーションの制限:** HTTPリファラ
     - `http://localhost:1236/*`
     - `https://<GitHubユーザー名>.github.io/*`（Pages利用時）
   - **APIの制限:** Cloud Vision API のみ
5. Vision の月次割り当てを **1000** 前後に下げると、無料枠超えの課金を防げます（Console → IAMと管理 → 割り当て）

### 無料枠について

- Text Detection / Document Text Detection は **毎月最初の 1000 units まで無料**（機能ごと）
- このツールはアプリ側でも月次カウンタ（UTC月）を持ち、残り枚数を超える画像は処理しません
- 新規 GCP アカウントの試用クレジットがあっても、カウンタ上限はデフォルト 1000 のままです

## CSV列

| 列名 | 内容 |
|---|---|
| レシートID | 同一レシートの行をまとめるID |
| 日付 | `YYYY-MM-DD`（OCR推定、編集可） |
| 店名 | 店舗名（OCR推定） |
| 品目 | 明細行の商品名 |
| 数量 | 取れれば（多くは空、手編集） |
| 単価 | 取れれば（多くは空、手編集） |
| 金額 | 行金額（円） |
| 支払方法 | 現金 / クレジット / PayPay 等 |
| 税区分 | 手編集用 |
| メモ | 手編集用 |
| 元ファイル名 | 読み込んだ画像名 |

OCRはレシートの書式によって精度が変わります。必ず画面で確認してから CSV を保存してください。

## プライバシー

- APIキー・OCR使用量カウンタ・ログインセッション以外のレシートデータは、明示的にダウンロードしない限り端末外へ保存しません（一覧の永続化は v1 では行いません）
- 画像は Vision API 呼び出し時のみ Google に送信されます
- 実レシート画像や実CSVはリポジトリにコミットしないでください（`data/` は gitignore 済み）

## GitHub Pages

`.github/workflows/deploy-pages.yml` が `receipts.html` もビルドします。デプロイ後は:

`https://<user>.github.io/<repo>/receipts.html`

Google OAuth の承認済み JavaScript 生成元に Pages のオリジンを追加し、Vision APIキーのリファラ制限にも同じオリジンを追加してください。
