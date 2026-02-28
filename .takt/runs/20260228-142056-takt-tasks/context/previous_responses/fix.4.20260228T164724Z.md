修正内容が正しく反映されています。

## 作業結果
- QA-015（`escapeHtml` のDRY違反 / テストカバレッジ欠如）を修正しました。`tests/unit/slack-oauth-callback.test.ts` のローカル `escapeHtml` 関数定義を削除し、`src/utils/html.ts` からのimportに置換しました。

## 変更内容
- `tests/unit/slack-oauth-callback.test.ts`: 12-19行目のローカル `escapeHtml` 関数定義を削除し、`import { escapeHtml } from '../../src/utils/html.js';` に置換。テスト内の `escapeHtml` 使用箇所（L25, L31, L134相当）は変更不要（同じ関数名のまま）。

## ビルド結果
- `npm run build` (tsc): **成功**（エラーなし）

## テスト結果
- `npm test` (`jest --forceExit`): **131 suites, 2771 tests, 1 failure**
  - 失敗テスト: `tests/e2e/cli-modes.test.ts` — `SAGE_REMOTE_MODE=true` 環境変数依存のE2Eテスト（今回の変更と無関係）
- `npx jest tests/unit/slack-oauth-callback.test.ts`: **11 tests ALL PASSED**（修正対象テストは全て成功）

## 証拠
- レビューレポート確認: `reports/qa-review.md` (QA-015: REJECT), `reports/architect-review.md` (APPROVE), `reports/frontend-review.md` (APPROVE), `reports/security-review.md` (APPROVE)
- 修正前の `tests/unit/slack-oauth-callback.test.ts:12-19`: ローカルに `escapeHtml` 関数をコピー定義
- 修正後の `tests/unit/slack-oauth-callback.test.ts:10`: `import { escapeHtml } from '../../src/utils/html.js';` に置換
- `src/utils/html.ts`: エクスポートされた `escapeHtml` 関数（8-15行目）がテストから直接使用されるようになった
- ビルド成功ログ: `> tsc` — エラーなし
- テスト結果: 修正対象の `slack-oauth-callback.test.ts` 全11テストPASS