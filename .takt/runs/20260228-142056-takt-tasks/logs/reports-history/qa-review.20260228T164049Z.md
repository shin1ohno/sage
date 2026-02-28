# QAレビュー

## 結果: REJECT

## サマリー
前回の6件の指摘（QA-007〜QA-012）は全て実コードで解消を確認。しかし、ARCH-002リファクタリングで `action-item-builder.ts` に移動された `deduplicateActionItems` 関数にテストが存在せず、また新規テストファイル内に `any` 型が残存しているため、REJECTとする。

## 確認した観点
| 観点 | 結果 | 備考 |
|------|------|------|
| テストカバレッジ | ❌ | `deduplicateActionItems`（action-item-builder.ts:94-123）にテストなし |
| テスト品質 | ⚠️ | `daily-summary-service.test.ts:75` に `as [any]` 型アサーション |
| エラーハンドリング | ✅ | 全新規ファイルでエラーをログ付きでハンドリング。空catchなし |
| ログとモニタリング | ✅ | 全新規ファイルで `createLogger()` を統一使用 |
| 保守性 | ✅ | リファクタリング後のファイルサイズ適切。TODO/FIXMEなし |

## 今回の指摘（new）
| # | finding_id | カテゴリ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | QA-013 | テストカバレッジ | `src/services/action-item-builder.ts:94-123` | 新規モジュールのエクスポート関数 `deduplicateActionItems` にテストが存在しない。`action-item-builder.test.ts` は `resolveAssigneeEmail` と `buildActionItem` のみカバー。`post-meeting-processor.test.ts:34` は `getActionItemsForRecurring` が常に `[]` を返すモックのため、L149 の `if (existingItems.length > 0)` 条件が真にならず dedup パスは一切通らない。関数はLLMレスポンスのJSONパース・フォールバック・配列フィルタリングを含む | `tests/unit/action-item-builder.test.ts` に `deduplicateActionItems` のテストを追加。最低限: (1) LLMが正常にunique配列を返す → その配列が返る (2) LLMレスポンスのJSONパースが失敗 → 元のnewItems全件が返る (3) samplingService がthrow → catch ブロック（post-meeting-processor.ts L152-157）でフォールバックされることの間接確認 |
| 2 | QA-014 | 型安全性 | `tests/unit/daily-summary-service.test.ts:74-75` | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `return new realDate(...(args as [any]))` — 新規テストファイル内の `any` 型使用。ポリシー「`any` 型の使用」→ REJECT | `as [any]` を `as [string]` に置き換え、`eslint-disable` コメントを削除。このテスト内での Date コンストラクタ呼び出しは文字列引数のみ（`'2026-03-01T10:00:00Z'`）。または `jest.useFakeTimers().setSystemTime(new Date('2026-03-01T10:00:00Z'))` でDateモック自体を簡素化する |

## 継続指摘（persists）
なし

## 解消済み（resolved）
| finding_id | 解消根拠 |
|------------|----------|
| QA-007 | `tests/unit/meeting-filter.test.ts` が10テストケースで存在。regex（L60-66）、substring（L76-82）、calendarフィルタ（L92-98）、空excludePatterns（L108-112）をカバー |
| QA-008 | `tests/unit/daily-summary-service.test.ts` が4テストケースで存在。enabled=false（L47-50）、already-sent guard（L52-63）、就業時間前（L65-86）、就業時間後（L88-95）をカバー |
| QA-009 | `tests/unit/pipeline-critical-error-handler.test.ts` が5テストケースで存在。SlackTokenRevokedError（L25-29）、auth/scopeエラー（L31-41）、非クリティカルエラー（L43-47）、Slack送信失敗（L49-53）をカバー |
| QA-010 | `tests/unit/action-item-builder.test.ts` が10テストケースで存在。resolveAssigneeEmail（L24-46：5テスト）、buildActionItem（L48-116：5テスト）をカバー |
| QA-011 | `tests/unit/llm-response-parser.test.ts` が8テストケースで存在。extractJsonFromLlmResponse（L11-39：5テスト）、parseExtractResponse（L41-70：3テスト）をカバー |
| QA-012 | `src/oauth/google-oauth-handler.ts:10` — `CodeChallengeMethod` を `google-auth-library` からインポート。L126 — `code_challenge_method: CodeChallengeMethod.S256` を使用。`as any` 完全削除確認済み |

## REJECT判定条件
- `new` が2件（QA-013, QA-014）
- QA-013: 新規モジュールの公開関数 `deduplicateActionItems` に対するテスト欠如（ポリシー「テストがない新しい振る舞い」→ REJECT）
- QA-014: 新規テストファイル内の `any` 型使用（ポリシー「`any` 型の使用」→ REJECT）
- ブロッキング問題が2件あるため **REJECT**