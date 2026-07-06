# Supabase セットアップ（家計簿ツール）

家計簿データを Supabase Postgres に保存し、スマホ・PC 間で同期するための手順です。**Supabase を設定しない場合は、従来どおり localStorage のみで動作します。**

## 前提

| 項目 | 方針 |
|---|---|
| DB 保存範囲 | **パターン B** — 明細・マーク・メモをすべて DB に保存 |
| アクセス | **夫・妻の Google アカウントのみ**（`allowed_emails` テーブル） |
| データ共有 | 2人目がログインすると **同じ household** に参加（同じ明細・マークを共有） |
| 認証 | **Google OAuth** |
| バックアップ | **全データ CSV エクスポートは引き続き利用可能** |

## 1. Supabase プロジェクト作成

1. https://supabase.com でアカウント作成（Free プラン、クレジットカード不要）
2. **New project** → リージョン選択 → DB パスワード設定
3. プロジェクトが起動するまで待つ

## 2. スキーマ適用

**SQL Editor** で、次の順に **Run** します。

1. [`supabase/migrations/001_initial_schema.sql`](../supabase/migrations/001_initial_schema.sql)
2. [`supabase/migrations/002_allowed_emails_google.sql`](../supabase/migrations/002_allowed_emails_google.sql)

002 には **`tsu4480@gmail.com`（夫）** と **`tomopri320@gmail.com`（妻）** が登録されています。

### メールアドレスを追加・変更する

SQL Editor で実行：

```sql
insert into public.allowed_emails (email, note)
values ('追加@gmail.com', 'メモ');
```

## 3. Google OAuth 設定

### 3a. Google Cloud Console

1. https://console.cloud.google.com/ → プロジェクト作成
2. **APIs & Services → OAuth consent screen** — 外部、テストユーザーに夫・妻の Gmail を追加
3. **Credentials → Create OAuth client ID** — 種類: **Web application**
4. **Authorized JavaScript origins** に追加:
   - `https://yosio44.github.io`（GitHub Pages）
   - `http://localhost:1235`（ローカル開発）
5. **Authorized redirect URIs** に Supabase の Callback URL を追加（次の 3b で確認）

### 3b. Supabase Dashboard

1. **Authentication → Providers → Google** を有効化
2. Google の Client ID / Client Secret を貼り付け
3. 表示される **Callback URL**（`https://xxxx.supabase.co/auth/v1/callback`）を Google Cloud の Redirect URIs に追加
4. **Authentication → URL Configuration**
   - **Site URL**: `https://yosio44.github.io/code_sb_tsu4480/kakeibo.html`
   - **Redirect URLs**: 上記 + `http://localhost:1235/kakeibo.html`

## 4. ログイン制限（Auth Hook・推奨）

ブラウザ側のチェックに加え、**サインアップ前に拒否**する Auth Hook をデプロイします。

```bash
# Supabase CLI をインストール・ログイン後
supabase link --project-ref <your-project-ref>
supabase functions deploy before-user-created --no-verify-jwt
```

**Dashboard → Authentication → Hooks → Before user created** で `before-user-created` 関数を選択します。

Hook 未設定でも、アプリ側で許可外メールは即ログアウトされます（Hook 設定を推奨）。

## 5. API キー取得

**Project Settings → API** から：

- **Project URL** → `SUPABASE_URL`
- **anon public** key → `SUPABASE_ANON_KEY`

**service_role キーはフロントエンドや GitHub Secrets に入れないでください。**

## 6. ローカル開発

```bash
cp .env.example .env
# .env に SUPABASE_URL と SUPABASE_ANON_KEY を設定
npm install
npm run kakeibo
```

## 7. GitHub Pages デプロイ

**Settings → Secrets and variables → Actions**:

| Secret 名 | 値 |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon public key |

## 8. 7日 pause 対策（任意）

[`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml) が週1 ping を送ります（Secrets 設定後に有効）。

## ログインの流れ

1. アプリで **Google でログイン**
2. `allowed_emails` にメールがあるか確認（Hook + アプリ側）
3. 初回ログイン（夫）→ 新しい household 作成
4. 2人目（妻）がログイン → **同じ household** に `member` として参加
5. 以降、どちらの端末からも同じ明細・マーク・メモが同期される

## プライバシー

Supabase 設定後は家計データがクラウド DB に保存されます。**許可された Google アカウント以外はログインできません。**

オフライン・非クラウド運用の場合は Secrets を設定せず localStorage モードのまま使えます。
