# レシート読み込みツール（Google Document AI）

レシート画像をまとめて Google Cloud Document AI（Expense Parser）で解析し、明細行の表にして CSV 出力する個人利用ツールです。家計簿集計ツール（MoneyForward ME）とは別画面で、突合は次バージョン予定です。

**注意:** レシート画像は OCR のため Google に送信されます。サービスアカウント鍵や APIキーはこの端末に保存しません。Document AI 呼び出しには短命の OAuth アクセストークン（ブラウザメモリのみ）を使います。

## 使い方（ブラウザ）

```bash
npm install
cp .env.example .env   # GOOGLE_CLIENT_ID を設定（家計簿ツールと同じ）
npm run receipts
```

ブラウザで http://localhost:1236/receipts.html を開きます。

1. **Googleログイン** — 家計簿ツールと同じ許可リストのアカウントでログインします。
2. **プロセッサ設定を確認** — プロジェクト ID / リージョン / プロセッサ ID（秘密情報ではない）を保存します。デフォルト値が入っています。
3. **Document AI を許可** — Google の同意画面で `cloud-platform` スコープを許可します（トークンはメモリのみ）。
4. **レシート画像を読み込む** — JPEG / PNG / WebP / GIF を複数選択（ドラッグ＆ドロップ可）。
5. **表を確認・編集** — OCR結果の明細行を画面上で修正できます。
6. **CSVをダウンロード** — UTF-8（BOM付き）で保存されます。

## Google Cloud Document AI の準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、請求先を紐づける
2. **Cloud Document AI API** を有効化
3. Document AI → プロセッサ ギャラリーから **Expense Parser** を作成（例: リージョン `asia-southeast1`）
4. 自分の Google アカウントに **Document AI API User**（または Owner）を付与
5. OAuth 同意画面でテストユーザーに自分のメールを追加し、スコープ `https://www.googleapis.com/auth/cloud-platform` を利用できるようにする
6. 既存の OAuth クライアント（家計簿用 `GOOGLE_CLIENT_ID`）の **承認済み JavaScript 生成元** に次を含める:
   - `http://localhost:1236`
   - `https://<GitHubユーザー名>.github.io`（Pages 利用時）
7. （推奨）請求の予算アラートを設定する — Document AI に Always Free 枠はありません

### 課金・上限について

- Document AI は従量課金です（無料トライアルの $300 / ¥ クレジットは利用可）
- このツールはアプリ側でも月次ソフト上限（UTC月、デフォルト 200 枚）を持ち、残り枚数を超える画像は処理しません
- GCP 側の予算アラートも併用してください

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

- プロセッサ設定・OCR使用量カウンタ・ログインセッション以外のレシートデータは、明示的にダウンロードしない限り端末外へ保存しません（一覧の永続化は v1 では行いません）
- OAuth アクセストークンはメモリのみ（localStorage には書きません）
- 画像は Document AI 呼び出し時のみ Google に送信されます
- 実レシート画像や実CSVはリポジトリにコミットしないでください（`data/` は gitignore 済み）

## GitHub Pages

`.github/workflows/deploy-pages.yml` が `receipts.html` もビルドします。デプロイ後は:

`https://<user>.github.io/<repo>/receipts.html`

Google OAuth の承認済み JavaScript 生成元に Pages のオリジンを追加してください。
