# QAレビュー

## 結果: REJECT

## サマリー
前回の6件の指摘（QA-001〜QA-006）は全て適切に修正されたことを実コードで確認。しかし、ARCHリファクタリングで抽出された5つの新規スタンドアロンモジュールに専用テストファイルがなく、かつ変更ファイル内に `as any` 型が残存しているため、REJECTとする。

## 確認した観点
| 観点 | 結果 | 備考 |
|------|------|------|
| テストカバレッジ | ❌ | 抽出された5新規モジュール（meeting-filter, daily-summary-service, pipeline-critical-error-handler, action-item-builder, llm-response-parser）に専用テストなし |
| テスト品質 | ✅ | 既存テスト（slack-service, config-loader, oauth-callback等）は適切なカバレッジ |
| エラーハンドリング | ✅ | 前回指摘の空catch修正済み、新規ファイルでも適切なログ付きエラー処理 |
| ログとモニタリング | ✅ | 全新規ファイルで `createLogger()` を統一使用。構造化ログ良好 |
| 保守性 | ⚠️ | `google-oauth-handler.ts:128` に `as any` が残存（変更ファイル内） |

## 今回の指摘（new）
| # | finding_id | カテゴリ | 場所 | 問題 | 修正案 |
|---|------------|---------|------|------|--------|
| 1 | QA-007 | テストカバレッジ | `src/services/meeting-filter.ts` (全60行) | 新規モジュール。`shouldProcessMeeting` は pipeline-scheduler.test.ts で間接テスト（allDay/attendeesのみ）だが、`matchesExcludePattern`（lines 36-58）の regex パターンマッチ・calendar タイプフィルタリングが未テスト | `tests/unit/meeting-filter.test.ts` を新規作成。最低限: (1) regex exclude パターンの title マッチ (2) substring exclude パターンの title マッチ (3) calendar タイプのマッチ (4) excludePatterns 空配列でマッチしない をカバー |
| 2 | QA-008 | テストカバレッジ | `src/services/daily-summary-service.ts` (全67行) | 新規モジュール。`DailySummaryService.checkAndSend` の working hours 比較（lines 50-56）、日次リセット（lines 38-41）、enabled フラグ（lines 32-34）が全て未テスト | `tests/unit/daily-summary-service.test.ts` を新規作成。最低限: (1) enabled=false → 送信なし (2) 既送信 → 再送信なし (3) 就業時間終了前 → 送信なし (4) 就業時間終了後 → 送信実行 をカバー |
| 3 | QA-009 | テストカバレッジ | `src/services/pipeline-critical-error-handler.ts` (全48行) | 新規モジュール。`handleCriticalError` のエラー分類ロジック（lines 24-27: SlackTokenRevokedError vs scope/auth vs 非クリティカル）が未テスト | `tests/unit/pipeline-critical-error-handler.test.ts` を新規作成。最低限: (1) SlackTokenRevokedError → 通知送信 (2) auth/scope エラー → 通知送信 (3) 非クリティカルエラー → 何もしない (4) Slack送信失敗 → ログのみ・throw しない をカバー |
| 4 | QA-010 | テストカバレッジ | `src/services/action-item-builder.ts` (全86行) | 新規モジュール。`resolveAssigneeEmail`（lines 71-85）の双方向サブストリングマッチングロジック（セパレータ除去含む）が全く未テスト。post-meeting-processor.test.ts では lookupUser が null 返却のため Slack ユーザー解決パスもほぼ未検証 | `tests/unit/action-item-builder.test.ts` を新規作成。最低限: (1) resolveAssigneeEmail — localPart マッチ成功 (2) resolveAssigneeEmail — マッチなし → undefined (3) resolveAssigneeEmail — 大小文字区別なし (4) buildActionItem — assignee 解決 + Slack ID 取得パス をカバー |
| 5 | QA-011 | テストカバレッジ | `src/utils/llm-response-parser.ts` (全16行) | 新規モジュール。`extractJsonFromLlmResponse` の markdown コードブロック抽出 regex（line 12: `` /```(?:json)?\s*([\s\S]*?)```/ ``）が未テスト。post-meeting-processor.test.ts は raw JSON のみ渡しており、コードブロック wrapped JSON パスを通らない | `tests/unit/llm-response-parser.test.ts` を新規作成。最低限: (1) raw JSON 文字列 → パース成功 (2) `` ```json ... ``` `` wrapped JSON → パース成功 (3) 無効な JSON → throw をカバー |
| 6 | QA-012 | 型安全性 | `src/oauth/google-oauth-handler.ts:128` | 変更ファイル内の `as any` 型アサーション。`generateAuthUrl()` に PKCE パラメータ（`code_challenge`, `code_challenge_method`）を渡すために使用。Google Auth Library の型定義に PKCE が未対応のため使用されているが、ポリシー上 `any` 型は REJECT 対象（ボーイスカウトルール適用） | `as any` を削除し、`// @ts-expect-error PKCE params (code_challenge, code_challenge_method) not yet typed in google-auth-library` に置き換え |

## 継続指摘（persists）
なし

## 解消済み（resolved）
| finding_id | 解消根拠 |
|------------|----------|
| QA-001 | `tests/unit/slack-service.test.ts` が14テストケースで存在。lazy初期化、token revocation検出、429 rate limit中止、lookupUser挙動をカバー |
| QA-002 | `tests/unit/config-loader.test.ts:255-304` にmeetingIntelligence/integrations.slackマイグレーションテスト2件追加確認 |
| QA-003 | `tests/unit/slack-oauth-callback.test.ts` が存在。escapeHtml検証、state検証フロー、503/400レスポンスをカバー |
| QA-004 | `tests/unit/google-drive-service.test.ts:64` — `as never` に変更確認 |
| QA-005 | `tests/unit/config-migration.test.ts:6` — `import type { UserConfig }` + `:33` — `let DEFAULT_CONFIG: UserConfig` に変更確認 |
| QA-006 | `src/services/channel-discovery.ts:116` — `logger.debug('JSON parse failed for channel IDs, falling back to regex extraction')` 追加確認 |

## REJECT判定条件
- `new` が6件（QA-007〜QA-012）
- QA-007〜QA-011: ARCHリファクタリングで抽出された新規スタンドアロンモジュールに対するテスト欠如（ポリシー「テストがない新しい振る舞い」→ REJECT）
- QA-012: 変更ファイル内の `as any`（ポリシー「`any` 型の使用」→ REJECT + ボーイスカウトルール）
- ブロッキング問題が1件以上あるため **REJECT**