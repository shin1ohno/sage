# QAレビュー

## 結果: REJECT

## サマリー
前回の2件の指摘（QA-013, QA-014）は実コードで解消を確認。しかし、新規テストファイル `slack-oauth-callback.test.ts` 内で `escapeHtml` 関数がローカルに再定義されており、ARCH-007修正で抽出された `src/utils/html.ts` の実際のエクスポート関数がテストされていない。DRY違反かつテストカバレッジの欠落としてREJECTとする。

## 確認した観点
| 観点 | 結果 | 備考 |
|------|------|------|
| テストカバレッジ | ❌ | `src/utils/html.ts:escapeHtml` のエクスポート関数がテストで直接使用されていない（ローカル複製をテスト） |
| テスト品質 | ⚠️ | 状態検証テスト（L39-77）がMap API操作のみテスト、実装のタイムアウトロジックと不一致 |
| エラーハンドリング | ✅ | SEC-003のSlack OAuth各パスでエラーをログ付きハンドリング。空catchなし |
| ログとモニタリング | ✅ | 新規エンドポイントで `cliLogger.info`/`warn`/`error` を適切に使用 |
| 保守性 | ✅ | `deduplicateActionItems` テスト追加、`daily-summary-service` テスト簡素化 |

## 今回の指摘（new）
| # | finding_id | カテゴリ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | QA-015 | DRY違反 / テストカバレッジ | `tests/unit/slack-oauth-callback.test.ts:12-19` | `escapeHtml` 関数がローカルにコピーされている（`src/utils/html.ts:8-15` と文字単位で同一）。ARCH-007修正で `escapeHtml` を `src/utils/html.ts` に抽出してDRY違反を解消したにも関わらず、新規テストファイルで即座に重複を再導入。結果として `src/utils/html.ts` のエクスポート関数は **どのテストからも直接importされておらず**、誰かが `src/utils/html.ts` を変更してもテストはローカルコピーを使い続けるため回帰検出不能。ポリシー「本質的に同じロジックの重複（DRY違反）」→ REJECT | L12-19のローカル関数定義を削除し、`import { escapeHtml } from '../../src/utils/html.js';` に置換する。テスト内の `escapeHtml` 使用箇所（L25, L31, L134）は変更不要 |

## 警告（Warning）
| # | カテゴリ | 場所 | 内容 |
|---|---------|------|------|
| 1 | テスト品質 | `tests/unit/slack-oauth-callback.test.ts:69-77` | 「expired state」テストが `Date.now() > storedExpiry` を検証しているが、実装（`http-server-with-config.ts:910`）の条件は `Date.now() - stateCreatedAt > SLACK_STATE_TIMEOUT_MS`。テストのMapには `Date.now() - 1000`（expiresAt概念）を格納しているが、実装は `Date.now()`（createdAt）を格納する。テストが検証する条件と実装の条件が異なるため、タイムアウトロジックのリグレッション検出効果が低い |

## 継続指摘（persists）
なし

## 解消済み（resolved）
| finding_id | 解消根拠 |
|------------|----------|
| QA-013 | `tests/unit/action-item-builder.test.ts:121-223` に `deduplicateActionItems` の describe ブロックが追加。4テスト: (1) LLMが正常にunique配列を返す→その配列を返す (2) JSONパース失敗→全newItems返す (3) uniqueフィールドなし→全newItems返す (4) promptTemplateManagerに正しいパラメータが渡される。L9で `deduplicateActionItems` を直接インポートして使用 |
| QA-014 | `tests/unit/daily-summary-service.test.ts:66-76` で `jest.useFakeTimers()` + `jest.setSystemTime()` パターンを使用。`as [any]` および `eslint-disable` コメントは完全に除去。ファイル全体に `any` 型なし（grep確認済み） |

## REJECT判定条件
- `new` が1件（QA-015）
- QA-015: `escapeHtml` のDRY違反 + `src/utils/html.ts` のエクスポート関数の直接テスト欠如（ポリシー「本質的に同じロジックの重複（DRY違反）」→ REJECT）
- ブロッキング問題が1件あるため **REJECT**