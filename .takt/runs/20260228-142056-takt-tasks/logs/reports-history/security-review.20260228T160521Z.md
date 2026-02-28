# セキュリティレビュー

## 結果: REJECT

## 重大度: High

## チェック結果
| カテゴリ | 結果 | 備考 |
|---------|------|------|
| インジェクション | ❌ | Reflected XSS（SEC-001） |
| 認証・認可 | ❌ | OAuth CSRF保護欠如（SEC-002） |
| データ保護 | ⚠️ | シークレット保存場所の不一致（警告） |
| 依存関係 | ✅ | - |

## 今回の指摘（new）
| # | finding_id | 重大度 | 種類 | 場所 | 問題 | 修正案 |
|---|------------|--------|------|------|------|--------|
| 1 | SEC-001 | High | XSS | `src/cli/http-server-with-config.ts:854` | URLクエリの`error`パラメータがHTMLエスケープなしで`<p>${error}</p>`に埋め込まれている。攻撃者が`?error=<script>...</script>`を含むURLを作成し被害者に踏ませることでReflected XSSが成立する | 同プロジェクトの`GoogleOAuthCallbackHandler`（`src/oauth/google-oauth-callback-handler.ts:341-347`）と同等の`escapeHtml()`を適用する。`res.end(\`...<p>${escapeHtml(error)}</p>\`)` |
| 2 | SEC-002 | High | CSRF | `src/cli/http-server-with-config.ts:840-876` | `handleSlackOAuthCallback`が`state`パラメータを読み取りも検証もしていない。`getAuthorizationUrl(state)`（`slack-oauth-handler.ts:58`）はstate生成に対応しているがコールバック側が未実装。攻撃者が自身のauthorization codeで被害者をリダイレクトさせ、攻撃者のSlackトークンを被害者サーバーに保存させるCSRFが可能 | Google OAuthと同様にPendingAuthStoreパターンを導入し、コールバックで`state`を照合してから`exchangeCodeForToken`を実行する |

## 解消済み（resolved）
なし

## 警告（非ブロッキング）
- `src/types/pipeline-config.ts:39-40` — `SlackIntegrationConfigSchema`に`clientId`/`clientSecret`フィールドがあり`slack-service-adapter.ts:26-31`がコンフィグから読み取るが、`http-server-with-config.ts:227`は環境変数を使用。シークレットの取得元を環境変数に統一すべき
- `src/cli/http-server-with-config.ts:228`, `src/services/reloadable/slack-service-adapter.ts:32` — デフォルトリダイレクトURIがHTTP。本番環境ではHTTPS強制を検討すべき