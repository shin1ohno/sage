# セキュリティレビュー

## 結果: REJECT

## 重大度: High

## チェック結果
| カテゴリ | 結果 | 備考 |
|---------|------|------|
| インジェクション | ✅ | SEC-001 (XSS) 解消継続確認済み |
| 認証・認可 | ❌ | SEC-003 Slack OAuth CSRF 未対策 |
| データ保護 | ✅ | トークン暗号化保存、ログに機密情報なし |
| 依存関係 | ✅ | `@slack/web-api ^7.14.1`, `htmlparser2 ^10.1.0`, `p-queue ^9.1.0` — メジャーパッケージ |

## 今回の指摘（new）
| # | finding_id | 重大度 | 種類 | 場所 | 問題 | 修正案 |
|---|------------|--------|------|------|------|--------|
| 1 | SEC-003 | High | CSRF | `src/cli/http-server-with-config.ts:852-888` | `handleSlackOAuthCallback` が OAuth state パラメータを検証していない。`code`/`error` のみ読み取り、`state` を無視。同コードベースの Google OAuth コールバック (`google-oauth-callback-handler.ts:71-97`) は state 検証を実装済み。`SlackOAuthHandler.getAuthorizationUrl(state)` (slack-oauth-handler.ts:58) も state 対応済みだが、コールバック側で照合されない。認可開始エンドポイントも不在 | 1) `/oauth/slack/authorize` エンドポイントを追加し `crypto.randomUUID()` で state 生成→有効期限付き Map に保存→`getAuthorizationUrl(state)` でリダイレクト。2) `handleSlackOAuthCallback` で `url.searchParams.get('state')` を読み取り、保存済み state と照合・ワンタイム消費。不一致/欠落時は 400 返却。Google OAuth と同じパターン |

## 解消済み（resolved）
| finding_id | 解消根拠 |
|------------|----------|
| SEC-001 | `src/cli/http-server-with-config.ts:110-118` に `escapeHtml()` 存在、行866で `${escapeHtml(error)}` 適用。5文字エスケープ確認 |
| SEC-002 | Google OAuth CSRF は `src/oauth/google-oauth-callback-handler.ts:71-97` で state 検証実装済み。今回の変更に影響なし |

## 警告（非ブロッキング）
- `src/cli/http-server-with-config.ts:240` — Slack OAuth デフォルト redirect URI が HTTP。本番では `SLACK_REDIRECT_URI` で HTTPS 指定必須（前回警告の継続）
- `src/oauth/google-oauth-handler.ts:53` — `drive.readonly` スコープ追加による権限拡大。`google-drive-service.ts:42` でスコープ存在チェック実装済みのため実害リスク低

## REJECT判定条件
- SEC-003 (new) が1件存在するため REJECT