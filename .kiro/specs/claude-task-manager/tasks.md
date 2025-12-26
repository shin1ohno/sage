# 実装計画

> **TDD原則**: 各タスクは「テスト作成 → 実装 → リファクタリング」の順で進める
> **プラットフォーム**: macOS 専用（AppleScript のため）
> **アクセス方式**: Desktop/Code (直接MCP)、iOS/iPadOS/Web (macOS上のRemote MCP Server経由)

## 完了済みタスク

- [x] 1. プロジェクト基盤とマルチプラットフォーム構造を構築
  - TypeScriptプロジェクトの初期化とMCP SDK対応
  - Jest設定とテスト環境のセットアップ
  - プラットフォーム検出とアダプター基盤の実装
  - _要件: 1.1, 1.2, 7.1, 7.2_

- [x] 2. プラットフォームアダプターファクトリーを実装
  - MCPAdapterとRemoteMCPAdapterの実装
  - 統一インターフェースでのプラットフォーム抽象化
  - _要件: 7.3, 7.4, 7.5_

- [x] 3. 共通コアロジックの実装
  - プラットフォーム非依存のタスク分析ロジック
  - 共通データモデルとインターフェース定義
  - _要件: 2.1, 2.2, 11.1_

- [x] 4. 設定管理システムの実装
  - プラットフォーム適応型設定管理
  - 設定値検証システム
  - _要件: 1.1, 1.5, 10.1, 10.2, 10.3, 10.6_

- [x] 5. セットアップウィザードの実装
  - プラットフォーム適応型セットアップ状態確認
  - 対話的セットアップウィザード
  - プラットフォーム固有質問と設定保存機能
  - _要件: 1.1, 1.3, 1.4, 1.6_

- [x] 6. タスク分析エンジンの実装
  - 複数タスク分離機能
  - 大きなタスクの分割機能
  - タスク依存関係と順序付け
  - _要件: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 7. 優先度判定エンジンの実装
  - 基本優先度ルールエンジン
  - 期限ベース優先度判定
  - 関係者ベース優先度判定
  - _要件: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 8. 時間見積もりシステムの実装
  - キーワードベース時間見積もり
  - _要件: 3.1, 3.2, 2.6_

- [x] 9. 関係者抽出システムの実装
  - 基本関係者抽出機能
  - @メンション検出機能
  - マネージャー検出機能
  - _要件: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 10. タスク分析統合システムの実装
  - analyze_tasksツール
  - 分析結果フォーマット機能
  - _要件: 2.1, 2.5, 2.6_

- [x] 11. Apple Reminders統合の実装
  - プラットフォーム別Reminders統合基盤
  - AppleScript Reminders統合（Desktop MCP専用）
  - 統合リマインダー作成機能
  - Web版フォールバック機能
  - _要件: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 12. カレンダー統合の実装
  - プラットフォーム別カレンダー統合基盤
  - AppleScriptカレンダー統合（Desktop MCP専用）
  - Web版カレンダーフォールバック機能
  - 空き時間検出機能
  - 作業適合度評価機能
  - _要件: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

- [x] 13. リマインド管理システムの実装
  - リマインド振り分けロジック
  - set_reminderツール
  - リマインド時間計算機能
  - _要件: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 14. エラーハンドリングとロバストネスの実装
  - 統一エラーハンドリングシステム
  - リトライ機構
  - グレースフルデグラデーション機能
  - _要件: 5.6, 8.5, 9.5_

- [x] 15. マルチプラットフォーム対応の実装
  - Desktop/Code MCP版パッケージング
  - _要件: 7.1, 7.4_

- [x] 16. テストカバレッジ確認
  - 全テストの実行と結果確認（94%達成）
  - _要件: 全要件の検証_

- [x] 17. ドキュメントとデプロイメント準備
  - プラットフォーム別ユーザードキュメント作成
  - _要件: 1.3, 1.6_

## 緊急修正が必要なタスク

- [x] 18. **緊急修正**: Notion統合の設定制約を厳格化
- [x] 18.1 Notion MCP統合の実際の実装
  - ✅ **テスト**: `tests/unit/notion-mcp-integration.test.ts`実装済み
  - ✅ 実際のMCP呼び出し実装済み（buildCreatePageRequest, buildQueryDatabaseRequest）
  - ✅ 設定されたdatabaseIdのみを対象とする厳格な制約実装済み
  - ✅ MCP Server接続エラーハンドリング実装済み
  - _要件: 8.1, 8.2, 8.3_

- [x] 18.2 TODOリスト管理の実装完了
  - ✅ **テスト**: `tests/unit/todo-list-manager.test.ts`実装済み
  - ✅ fetchFromNotion()メソッド実装済み（MCP経由でのNotion DB クエリ）
  - ✅ 設定されたNotionデータベースIDからのみタスク取得実装済み
  - ✅ Apple Remindersからの既存タスク取得実装済み
  - _要件: 12.1, 12.2, 12.3_

- [x] 18.3 Notion検索クエリの厳格化
  - ✅ **テスト**: Notion検索制約のテストケース実装済み
  - ✅ 指定されたdatabaseId以外からの検索を完全に禁止実装済み
  - ✅ データベース存在確認とアクセス権限チェック実装済み
  - ✅ 不正なデータベースアクセス時のエラーハンドリング実装済み
  - _要件: 8.1, 8.5_

- [x] 18.4 TODOリスト管理システムの完全実装
  - ✅ **テスト**: `tests/unit/todo-list-manager.test.ts`実装済み
  - ✅ 統合TODOリスト取得機能実装済み（listTodos）
  - ✅ タスクフィルタリング機能実装済み（priority, status, source, tags, date range）
  - ✅ タスクステータス更新機能実装済み（updateTaskStatus）
  - ✅ list_todosツール実装済み（src/index.ts）
  - _要件: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

- [x] 18.5 タスク同期システムの完全実装
  - ✅ **テスト**: `tests/unit/task-synchronizer.test.ts`実装済み
  - ✅ 複数ソース間タスク同期機能実装済み（syncAllTasks）
  - ✅ 重複タスク検出機能実装済み（detectDuplicates）
  - ✅ update_task_statusツール実装済み（src/index.ts）
  - _要件: 12.5, 12.6_

## 修正が必要なタスク

- [x] 19. **テスト修正**: 失敗しているテストの修正
- [x] 19.1 E2Eテストの修正
  - ✅ **テスト**: `tests/e2e/full-workflow.test.ts`の失敗修正済み
  - ✅ 関係者抽出ロジックの調整（山田部長の検出）- MANAGER_KEYWORDSに部長追加
  - ✅ タスク分割ロジックの調整（番号付きリスト+箇条書きの混合対応）
  - ✅ 優先度判定ロジックの調整（マネージャーキーワード拡充）
  - _要件: 2.1-2.6, 4.1-4.5, 11.1-11.6_

- [x] 19.2 エッジケーステストの修正
  - ✅ **テスト**: `tests/unit/edge-cases.test.ts`の全テスト通過
  - ✅ 空文字列/空白のみ入力の処理追加
  - ✅ 今日の期限の優先度判定修正（diffMs <= 0も考慮）
  - ✅ Jest transformIgnorePatterns設定追加（ESMモジュール対応）
  - _要件: 全要件のエッジケース検証_

- [x] 19.3 TODO実装の完了
  - ✅ **実装**: `src/integrations/todo-list-manager.ts`のTODOコメント解決
  - ✅ Apple Remindersのタスクステータス更新実装（AppleScript経由）
  - ✅ Notionのタスクステータス更新実装（MCP経由）
  - _要件: 12.5, 12.6_

- [x] 19.4 AppleScriptカレンダー日付フォーマット修正
  - ✅ **バグ修正**: `src/integrations/calendar-service.ts`のISO 8601日付解析問題
  - ✅ AppleScriptがISO 8601形式（`2025-12-26`）を正しく解析できない問題を修正
  - ✅ 日付をコンポーネント（年、月、日）に分解してAppleScript内で組み立てる方式に変更
  - ✅ 全テスト通過（27 suites, 495 tests）
  - _要件: 6.2, 6.3_

- [x] 19.5 繰り返しイベントのフィルタリング問題を修正
  - ✅ **バグ修正**: Calendar.appのAppleScriptは繰り返しイベントの「マスター」のみ返す問題
  - ✅ EventKit (AppleScriptObjC)を使用した実装に変更
  - ✅ EventKitが繰り返しイベントを個々の発生（occurrence）に自動展開
  - ✅ isAllDayフィールドのサポートを追加
  - _要件: 6.2, 6.3, 6.4_

- [x] 19.6 Calendar統合をEventKitに完全移行（TDD）
  - ✅ **リファクタリング**: Calendar.appのAppleScriptからEventKitへ完全移行
  - ✅ `CalendarMethod`型から`'applescript'`を削除し`'eventkit'`に置換
  - ✅ メソッド名を`fetchAppleScriptEvents`→`fetchEventKitEvents`に変更
  - ✅ メソッド名を`parseAppleScriptResult`→`parseEventKitResult`に変更
  - ✅ `source`フィールドをすべて`'eventkit'`に統一
  - ✅ コメントとドキュメントを更新
  - ✅ 全テスト通過（27 suites, 498 tests）
  - _要件: 6.1, 6.2, 6.3, 6.4_

## 将来実装予定のタスク

- [x] 20. Remote MCPサーバーの実装
- [x] 20.1 Remote MCPサーバー基盤を実装
  - ✅ **テスト**: `tests/unit/remote-mcp-server.test.ts`実装済み
  - ✅ HTTP/HTTPS API endpoints実装済み
  - ✅ MCP protocol over HTTP実装済み（JSONRPCRequest/Response）
  - ✅ 認証とセッション管理実装済み（SessionManager, AuthConfig）
  - _要件: 12.1, 12.2, 12.3_

- [x] 20.2 ~~クラウドデプロイメント設定を実装~~ (macOS必須のため削除)
  - ⏭️ Dockerfile/docker-compose.yml/wrangler.toml は削除
  - ⏭️ AppleScript が macOS でしか動作しないため、Docker/Cloudflare Workers は使用不可
  - ✅ macOS上でのRemote MCP Server実行ガイド作成済み（docs/SETUP-REMOTE.md）
  - _削除理由: AppleScript は macOS 専用のため_

- [x] 20.3 Remote MCP認証システムを実装
  - ✅ **テスト**: 認証システムのテストケース実装済み
  - ✅ JWT認証実装済み（AuthConfig.generateToken/validateToken）
  - ✅ API Key認証実装済み
  - ✅ IP whitelist対応実装済み
  - ✅ セッション管理とタイムアウト実装済み
  - _要件: 12.2, 12.4, 12.8_

- [x] 20.4 ハイブリッド統合システムを実装
  - ✅ **テスト**: `tests/unit/hybrid-integration.test.ts`実装済み
  - ✅ HybridIntegrationManager実装済み（src/remote/hybrid-integration.ts）
  - ✅ プラットフォーム別機能検出と統合戦略選択
  - ✅ Native/Remote/MCPフォールバック機能
  - _要件: 12.5_

- [x] 20.5 クラウド設定管理システムを実装
  - ✅ **テスト**: `tests/unit/cloud-config.test.ts`実装済み
  - ✅ CloudConfigManager実装済み（src/remote/cloud-config.ts）
  - ✅ AES-256-GCM暗号化/復号化
  - ✅ バージョン管理と競合検出
  - ✅ マルチデバイス対応
  - _要件: 12.3, 12.6_

- [x] 21. ~~iOS/iPadOS Skills版パッケージング~~ (Remote MCP対応により不要)
  - ⏭️ Remote MCP Server経由でiOS/iPadOSからアクセス可能
  - _削除理由: Skills統合ではなくRemote MCP経由で完全機能を提供_

- [x] 22. ~~Web Skills版パッケージング~~ (Remote MCP対応により不要)
  - ⏭️ Remote MCP Server経由でWebからアクセス可能
  - _削除理由: Skills統合ではなくRemote MCP経由で完全機能を提供_

- [x] 23. プラットフォーム間互換性テストを実装
  - ✅ **テスト**: `tests/integration/platform-compatibility.test.ts`実装済み
  - ✅ MCP/iOS/Webアダプター間のコアロジック一貫性テスト
  - ✅ 日本語入力処理の互換性テスト
  - ✅ ハイブリッド統合との連携テスト
  - _要件: 7.3, 7.4, 7.5_

- [x] 24. Remote MCP E2Eテストを実装
  - ✅ **テスト**: `tests/e2e/remote-mcp-workflow.test.ts`実装済み
  - ✅ サーバーライフサイクル完全テスト
  - ✅ 認証フロー（JWT/API Key/IP）テスト
  - ✅ セッション管理ワークフローテスト
  - ✅ クラウド設定同期ワークフローテスト
  - _要件: 12.1-12.8_

- [x] 25. E2Eテストの拡張
  - ✅ **テスト**: `tests/e2e/full-workflow.test.ts`実装済み
  - ✅ セットアップから分析、リマインド作成までの完全フロー
  - ✅ 実際のユーザーシナリオの検証
  - _要件: 1.1-1.6, 2.1-2.6, 5.1-5.6_

- [x] 26. エッジケーステストの追加
  - ✅ 境界値テスト実装済み
  - ✅ エラー条件のテスト実装済み
  - ✅ 国際化（日本語/英語）のテスト実装済み
  - _要件: 全要件_

- [x] 27. Remote MCPサーバーデプロイメントを実装
  - ⏭️ Dockerfile/docker-compose.yml/wrangler.toml は削除（macOS必須のため）
  - ✅ macOS上でのRemote MCP Server実行ガイド作成済み（docs/SETUP-REMOTE.md）
  - ✅ pm2/launchd でのバックグラウンド実行設定ガイド作成済み
  - ✅ CI/CDパイプライン設定済み（.github/workflows/）
  - _要件: 12.7, 12.8_

- [x] 28. 開発者ドキュメントを作成
  - ✅ マルチプラットフォームアーキテクチャの説明（docs/ARCHITECTURE.md）
  - ✅ プラットフォーム別拡張とカスタマイズガイド
  - _要件: 全要件の実装ガイド_

- [x] 29. 配布パッケージを作成
  - ✅ MCP版パッケージ設定済み（package.json、manifest.json）
  - ✅ npm publish設定済み（.github/workflows/publish.yml）
  - ✅ MCPB build設定済み（.github/workflows/mcpb.yml）
  - ⏭️ Docker設定は削除（macOS必須のため）
  - _要件: 7.1, 7.2, 7.3_

## 完了済み追加タスク

- [x] 30. CLIオプションとRemote MCPサーバー起動機能の実装
- [x] 30.1 CLIオプションパーサーの実装
  - ✅ **テスト**: `tests/unit/cli-parser.test.ts`実装済み（32 tests）
  - ✅ `--remote`オプションの解析
  - ✅ `--config <path>`オプションの解析
  - ✅ `--port <number>`オプションの解析
  - ✅ `--host <address>`オプションの解析
  - ✅ `--help`と`--version`オプションの実装
  - ✅ 環境変数（SAGE_REMOTE_MODE, SAGE_PORT等）のサポート
  - _要件: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

- [x] 30.2 HTTPサーバーモードの実装
  - ✅ **テスト**: `tests/unit/http-server.test.ts`実装済み（20 tests）
  - ✅ `--remote`オプション時にHTTPサーバーを起動
  - ✅ `/health`エンドポイントの実装
  - ✅ `/mcp`エンドポイントでMCPリクエスト処理
  - ✅ `/auth/token`エンドポイントでJWTトークン生成
  - ✅ 既存の`RemoteMCPServer`クラスとの統合
  - _要件: 14.1, 14.9, 14.10, 13.1_

- [x] 30.3 メイン関数のリファクタリング
  - ✅ **テスト**: `tests/unit/main-entry.test.ts`実装済み（10 tests）
  - ✅ `src/index.ts`のメイン関数を更新
  - ✅ オプションに基づいてStdioモードまたはHTTPモードを選択
  - ✅ 設定ファイルパスの動的読み込み
  - _要件: 14.1, 14.2, 14.3_

- [x] 30.4 E2Eテストの追加
  - ✅ **テスト**: `tests/e2e/cli-modes.test.ts`実装済み（11 tests）
  - ✅ Stdioモードの起動テスト
  - ✅ HTTPモードの起動テスト
  - ✅ ヘルスチェックエンドポイントのテスト
  - ✅ MCPエンドポイントのテスト
  - _要件: 14.1-14.10_

## 完了済み追加タスク (続き)

- [x] 31. Remote MCP設定ファイルと認証の実装
- [x] 31.1 リモート設定ファイルローダーの実装
  - ✅ **テスト**: `tests/unit/remote-config-loader.test.ts`実装済み（17 tests）
  - ✅ `~/.sage/remote-config.json`の読み込み
  - ✅ 設定ファイルのバリデーション
  - ✅ デフォルト値のマージ
  - _要件: 15.1, 15.2, 15.3, 15.10_

- [x] 31.2 Secret認証の実装
  - ✅ **テスト**: `tests/unit/secret-auth.test.ts`実装済み（23 tests）
  - ✅ `/auth/token`エンドポイントでsecret認証
  - ✅ JWTトークン生成（有効期限付き）
  - ✅ 不正なsecretへの401エラーレスポンス
  - _要件: 15.4, 15.5, 15.6_

- [x] 31.3 JWT認証ミドルウェアの実装
  - ✅ **テスト**: `tests/unit/jwt-middleware.test.ts`実装済み（19 tests）
  - ✅ `Authorization: Bearer <token>`ヘッダーの検証
  - ✅ トークン有効期限チェック
  - ✅ 認証エラーハンドリング
  - _要件: 15.7, 15.8_

- [x] 31.4 HTTPサーバーとの統合
  - ✅ **テスト**: `tests/unit/http-server-auth.test.ts`実装済み（14 tests）
  - ✅ 起動時に設定ファイルを読み込み
  - ✅ 設定に基づいてCORSヘッダーを設定
  - ✅ CLIオプション > 環境変数 > 設定ファイル > デフォルト値の優先順位
  - _要件: 15.9_

- [x] 31.5 E2Eテストの追加
  - ✅ **テスト**: `tests/e2e/remote-auth.test.ts`実装済み（9 tests）
  - ✅ 設定ファイルからの起動テスト
  - ✅ Secret認証フローのテスト
  - ✅ JWT認証フローのテスト
  - _要件: 15.1-15.10_

## 完了済み追加タスク (続き)

- [x] 32. Remote MCP Server の実際の MCP ハンドリング実装
- [x] 32.1 HTTP Server に MCP ツール処理を統合
  - ✅ **テスト**: `tests/unit/mcp-handler.test.ts`実装済み（16 tests）
  - ✅ `MCPHandler`クラス実装済み（`src/cli/mcp-handler.ts`）
  - ✅ `tools/list` メソッド実装済み
  - ✅ `tools/call` メソッド実装済み
  - ✅ `initialize` メソッド実装済み
  - ✅ `http-server-with-config.ts` への統合完了
  - ✅ 全13ツール（analyze_tasks, set_reminder, list_todos等）がHTTP経由で利用可能
  - ✅ **E2Eテスト**: `tests/e2e/mcp-over-http.test.ts`実装済み（8 tests）
  - _要件: 13.1, 13.4, 13.5_

- [x] 32.2 Claude iOS App 互換性の確認
  - ⚠️ Claude iOS は OAuth 2.0 認証のみサポート
  - ✅ 現状は JWT認証または認証なしモードで使用（ローカルネットワーク限定）
  - 📋 OAuth 2.0 対応は将来対応
  - _要件: 13.2_

## 完了済み追加タスク (続き)

- [x] 33. カレンダーイベント一覧取得ツールの実装
- [x] 33.1 list_calendar_events MCPツールの実装
  - ✅ `CalendarService.listEvents()` メソッドの追加
  - ✅ 入力パラメータ検証（startDate, endDate, calendarName）
  - ✅ ISO 8601形式の日付パース
  - ✅ カレンダー名によるフィルタリング
  - _要件: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 33.2 繰り返しイベントの展開処理
  - ✅ EventKitの繰り返しイベント取得
  - ✅ 指定期間内の各occurrence を個別イベントとして返却
  - _要件: 16.6_

- [x] 33.3 特殊イベントの処理
  - ✅ 終日イベント（isAllDay: true）の処理
  - ✅ 複数日にまたがるイベントの処理
  - ✅ タイムゾーン処理（JST/Asia/Tokyo デフォルト）
  - _要件: 16.7, 16.8, 16.9_

- [x] 33.4 レスポンスフォーマットとエラーハンドリング
  - ✅ CalendarEventDetailed型の追加（calendar, location フィールド追加）
  - ✅ ListEventsResponse 形式での返却
  - ✅ カレンダーアクセス不可時のエラーメッセージ
  - _要件: 16.10, 16.11, 16.12_

- [x] 33.5 テストの実装
  - ✅ **テスト**: `tests/unit/list-calendar-events.test.ts`実装済み（21 tests）
  - ✅ 単一日のイベント取得テスト
  - ✅ 1週間のイベント取得テスト
  - ✅ 特定カレンダーでのフィルタリングテスト
  - ✅ 繰り返しイベント展開テスト
  - ✅ タイムゾーン処理テスト

## 完了済み追加タスク (続き)

- [x] 34. カレンダーイベント返信機能の実装
- [x] 34.1 CalendarEventResponseService基盤の実装
  - ✅ `EventResponseType` 型定義（accept/decline/tentative）
  - ✅ `EventResponseRequest`/`EventResponseResult` インターフェース
  - ✅ `CalendarEventResponseService` クラスの作成
  - ✅ イベント返信可否チェック（`canRespondToEvent`）
  - _要件: 17.1, 17.7, 17.9, 17.10_

- [x] 34.2 カレンダータイプ検出と返信戦略
  - ✅ イベントIDからカレンダータイプ検出（Google/iCloud/Exchange/Local）
  - ✅ カレンダータイプに応じた返信メソッド選択
  - ✅ 主催者/出席者/読み取り専用チェック
  - _要件: 17.5, 17.6, 17.7, 17.9, 17.10_

- [x] 34.3 EventKit経由の返信（iCloud/ローカル）
  - ✅ AppleScriptObjCを使用したEventKitアクセス
  - ✅ EKParticipant読み取り専用制約への対応
  - ✅ Calendar.appフォールバック処理
  - _要件: 17.6_

- [x] 34.4 Google Calendar API返信（オプション）
  - ⏭️ Google Calendar API は使用しない前提（カレンダータイプ検出のみ）
  - ✅ イベントIDからカレンダータイプを検出し、EventKit経由で処理
  - _要件: 17.5_

- [x] 34.5 バッチ処理機能
  - ✅ `respond_to_calendar_events_batch` MCPツール実装
  - ✅ 順次処理（各イベントごと）
  - ✅ 結果の集計とサマリー生成
  - _要件: 17.3, 17.4, 17.12_

- [x] 34.6 MCPツールの登録
  - ✅ `respond_to_calendar_event` ツールを index.ts に追加
  - ✅ `respond_to_calendar_events_batch` ツールを index.ts に追加
  - ✅ mcp-handler.ts への追加（HTTPモード対応）
  - _要件: 17.1, 17.3, 17.11_

- [x] 34.7 エッジケース処理
  - ✅ 繰り返しイベントの単一インスタンス処理
  - ✅ 終日イベントの処理
  - ✅ 個人の予定（出席者なし）のスキップ
  - _要件: 17.8, 17.9_

- [x] 34.8 テストの実装
  - ✅ **テスト**: `tests/unit/calendar-event-response.test.ts`実装済み（29 tests）
  - ✅ 単一イベント返信テスト
  - ✅ バッチ返信テスト
  - ✅ 主催者イベントスキップテスト
  - ✅ 出席者なしイベントスキップテスト
  - ✅ 読み取り専用カレンダーエラーテスト

- [x] 35. カレンダーイベント作成機能の実装 ✅
  - ✅ 35.1 CalendarEventCreatorService基盤の実装
    - ✅ `CreateCalendarEventRequest`/`CreateCalendarEventResult` 型定義
    - ✅ `CalendarEventCreatorService` クラスの作成
    - ✅ 入力パラメータ検証ロジック（タイトル必須、日時形式、終了>開始チェック）
    - _要件: 18.1, 18.2, 18.3_
  - ✅ 35.2 EventKit経由のイベント作成
    - ✅ AppleScriptObjCを使用したEventKitアクセス
    - ✅ EKEventの作成と保存処理
    - ✅ デフォルトカレンダーの取得
    - ✅ 指定カレンダーへの作成
    - _要件: 18.5, 18.6_
  - ✅ 35.3 アラーム設定機能
    - ✅ 相対時間文字列のパース（`-15m`, `-1h`, `-1d`, `-1w`）
    - ✅ EKAlarmの作成とイベントへの追加
    - ✅ 複数アラームのサポート
    - _要件: 18.4_
  - ✅ 35.4 終日イベント処理
    - ✅ 開始・終了時刻が00:00:00の検出
    - ✅ `isAllDay: true`としてイベント作成
    - _要件: 18.7_
  - ✅ 35.5 エラーハンドリング
    - ✅ カレンダーが存在しない場合のエラー
    - ✅ 読み取り専用カレンダーのエラー
    - ✅ アクセス権限エラー
    - ✅ リトライ処理（retryWithBackoff使用）
    - _要件: 18.8, 18.9, 18.11_
  - ✅ 35.6 MCPツールの登録
    - ✅ `create_calendar_event` ツールを index.ts に追加
    - ✅ mcp-handler.ts への追加（HTTPモード対応）
    - ✅ 入力スキーマのZod定義
    - _要件: 18.1, 18.10_
  - ✅ 35.7 テストの実装 (34 tests)
    - ✅ 入力バリデーションテスト
    - ✅ 終日イベント検出テスト
    - ✅ アラーム文字列パーステスト
    - ✅ AppleScript生成テスト
    - ✅ エラーハンドリングテスト
    - ✅ 結果メッセージ生成テスト

## 完了済みタスク (続き)

- [x] 36. カレンダーイベント削除機能の実装 ✅
  - ✅ 36.1 CalendarEventDeleterService基盤の実装
    - ✅ `DeleteCalendarEventRequest`/`DeleteCalendarEventResult` 型定義
    - ✅ `DeleteCalendarEventsBatchRequest`/`DeleteCalendarEventsBatchResult` 型定義
    - ✅ `CalendarEventDeleterService` クラスの作成
    - ✅ 入力パラメータ検証ロジック
    - _要件: 19.1, 19.2, 19.3_
  - ✅ 36.2 イベントID抽出ロジック
    - ✅ `extractEventUid()` - フルIDからUUID抽出
    - ✅ フルID/UUIDどちらも受け付ける
    - _要件: 19.4, 19.5_
  - ✅ 36.3 EventKit AppleScriptObjC削除
    - ✅ EventKit経由の削除スクリプト（`create_calendar_event`と同じ方式）
    - ✅ カレンダー指定時の削除スクリプト
    - ✅ 全カレンダー検索時の削除スクリプト
    - ✅ 結果パース処理
    - _要件: 19.6, 19.9_
  - ✅ 36.4 エラーハンドリング
    - ✅ イベントが見つからない場合のエラー
    - ✅ 読み取り専用カレンダーのエラー
    - ✅ AppleScript実行エラーの処理
    - _要件: 19.7, 19.8_
  - ✅ 36.5 バッチ削除機能
    - ✅ `deleteEventsBatch()` メソッド実装
    - ✅ 順次処理（レート制限: 100ms間隔）
    - ✅ 結果集計とサマリー生成
    - _要件: 19.10, 19.11_
  - ✅ 36.6 MCPツールの登録
    - ✅ `delete_calendar_event` ツールを index.ts に追加
    - ✅ `delete_calendar_events_batch` ツールを index.ts に追加
    - ✅ mcp-handler.ts への追加（HTTPモード対応）
    - _要件: 19.1, 19.10_
  - ✅ 36.7 テストの実装 (33 tests)
    - ✅ UUID抽出テスト（フルID/UUIDのみ両方）
    - ✅ 単一イベント削除テスト
    - ✅ バッチ削除テスト
    - ✅ イベント未発見エラーテスト
    - ✅ AppleScript生成テスト
    - _要件: 19.12_

## 完了済みタスク (続き)

- [x] 37. Streamable HTTP Transport対応の実装 ✅
  - ✅ 37.1 SSEストリームハンドラーの実装
    - ✅ **テスト**: `tests/unit/sse-stream-handler.test.ts` (25 tests)
    - ✅ GET /mcp エンドポイントの追加
    - ✅ Content-Type: text/event-stream レスポンス
    - ✅ Cache-Control: no-cache ヘッダー
    - ✅ Connection: keep-alive ヘッダー
    - _要件: 20.1, 20.2, 20.5, 20.6_
  - ✅ 37.2 Keepalive機能の実装
    - ✅ 30秒間隔のkeepaliveコメント送信（`: keepalive\n\n`）
    - ✅ 接続切断時のタイマークリーンアップ
    - ✅ 複数接続のトラッキング
    - _要件: 20.3, 20.7_
  - ✅ 37.3 CORSヘッダー対応
    - ✅ Access-Control-Allow-Origin: * ヘッダー
    - ✅ Access-Control-Allow-Methods: GET, POST, OPTIONS ヘッダー
    - ✅ Access-Control-Allow-Headers: Content-Type, Authorization ヘッダー
    - ✅ OPTIONSリクエスト（CORS preflight）のサポート
    - _要件: 20.4, 20.9_
  - ✅ 37.4 HTTPサーバーへの統合
    - ✅ `src/cli/http-server-with-config.ts` の更新
    - ✅ GET /mcp ルートハンドラーの追加
    - ✅ 既存POST /mcpの動作維持確認
    - ✅ authEnabled: false 時の認証スキップ
    - _要件: 20.8, 20.10_
  - ✅ 37.5 E2Eテストの実装
    - ✅ **テスト**: `tests/e2e/streamable-http.test.ts` (15 tests)
    - ✅ GETリクエストでSSEストリームが返ることを確認
    - ✅ keepalive送信の確認
    - ✅ 接続切断後のクリーンアップ確認
    - ✅ 認証有効/無効両方のテスト
    - _要件: 20.1-20.10_

## 完了済みタスク: OAuth 2.1 認証

> **詳細仕様:** `.kiro/specs/claude-task-manager/oauth-spec.md` を参照

- [x] 38. OAuth 2.1 基盤実装 ✅
  - ✅ 38.1 OAuthサーバー基盤クラスの作成 (`src/oauth/oauth-server.ts`)
  - ✅ 38.2 JWTアクセストークン生成・検証（RS256署名）(`src/oauth/token-service.ts`)
  - ✅ 38.3 PKCE (S256) 実装 (`src/oauth/pkce.ts`)
  - ✅ 38.4 認可コード管理（生成・保存・検証・無効化）(`src/oauth/code-store.ts`)
  - ✅ 38.5 リフレッシュトークン管理とローテーション (`src/oauth/refresh-token-store.ts`)
  - _要件: 21.1-21.6_

- [x] 39. メタデータエンドポイント実装 ✅
  - ✅ 39.1 `/.well-known/oauth-protected-resource` 実装 (RFC 9728)
  - ✅ 39.2 `/.well-known/oauth-authorization-server` 実装 (RFC 8414)
  - ✅ 39.3 WWW-Authenticateヘッダー生成
  - _要件: 22.1-22.5, 23.1-23.9_

- [x] 40. Dynamic Client Registration実装 ✅
  - ✅ 40.1 `/oauth/register` エンドポイント実装 (RFC 7591)
  - ✅ 40.2 クライアント情報永続化（インメモリ）
  - ✅ 40.3 redirect_uri検証（Claude公式URLのみ許可）
  - ✅ 40.4 クライアント削除対応（invalid_clientエラー）
  - _要件: 24.1-24.8_

- [x] 41. Authorization Endpoint実装 ✅
  - ✅ 41.1 `/oauth/authorize` エンドポイント実装
  - ✅ 41.2 ユーザーログイン画面（HTML）
  - ✅ 41.3 同意画面（スコープ表示）
  - ✅ 41.4 認可コード発行とリダイレクト
  - ✅ 41.5 stateパラメータ検証（CSRF対策）
  - _要件: 25.1-25.10, 28.1-28.6_

- [x] 42. Token Endpoint実装 ✅
  - ✅ 42.1 `/oauth/token` エンドポイント実装
  - ✅ 42.2 authorization_code grant
  - ✅ 42.3 refresh_token grant
  - ✅ 42.4 PKCE code_verifier検証
  - ✅ 42.5 resource パラメータ検証 (RFC 8707)
  - ✅ 42.6 audience (aud) クレーム設定
  - _要件: 26.1-26.9_

- [x] 43. HTTPサーバー統合 ✅
  - ✅ 43.1 OAuthエンドポイントをHTTPサーバーに追加
  - ✅ 43.2 Bearer認証ミドルウェア更新（OAuth対応）
  - ✅ 43.3 既存JWT認証との後方互換性維持
  - ✅ 43.4 SSE接続でのBearer認証
  - ⏭️ 43.5 スコープベースのアクセス制御（将来実装予定）
  - _要件: 27.1-27.7, 31.5-31.6_

- [x] 44. ユーザー認証実装 ✅
  - ✅ 44.1 ログイン画面実装
  - ✅ 44.2 パスワードハッシュ化（SHA256、本番ではbcrypt推奨）
  - ✅ 44.3 セッション管理
  - ✅ 44.4 ログイン試行回数制限
  - _要件: 29.1-29.5_

- [x] 45. セキュリティ実装 ✅
  - ⏭️ 45.1 HTTPS強制（デプロイ環境で設定）
  - ✅ 45.2 redirect_uri完全一致検証
  - ✅ 45.3 認可コード使用後無効化
  - ⏭️ 45.4 トークン暗号化保存（将来実装予定、永続化時）
  - _要件: 30.1-30.9_

- [x] 46. テスト実装 ✅
  - ✅ 46.1 PKCEテスト (`tests/unit/oauth-pkce.test.ts` - 15 tests)
  - ✅ 46.2 トークンサービステスト (`tests/unit/oauth-token-service.test.ts` - 18 tests)
  - ✅ 46.3 認可コードストアテスト (`tests/unit/oauth-code-store.test.ts` - 10 tests)
  - ✅ 46.4 リフレッシュトークンストアテスト (`tests/unit/oauth-refresh-token-store.test.ts` - 13 tests)
  - ✅ 46.5 OAuthサーバーテスト (`tests/unit/oauth-server.test.ts` - 28 tests)
  - _要件: 全OAuth要件の検証_

## 実装完了サマリー

- **完了タスク**: 46タスク（OAuth含む）
- **未実装タスク**: 0タスク
- **テスト**: 49 suites, 922 tests passing
- **プラットフォーム**: macOS 専用（AppleScript/EventKit のため）
- **ドキュメント**: SETUP-LOCAL.md, SETUP-REMOTE.md, CONFIGURATION.md, ARCHITECTURE.md, TROUBLESHOOTING.md

### Task 31で追加されたファイル

- `src/cli/remote-config-loader.ts` - Remote MCP設定ファイルローダー
- `src/cli/secret-auth.ts` - Secret認証とJWTトークン生成
- `src/cli/jwt-middleware.ts` - JWT認証ミドルウェア
- `src/cli/http-server-with-config.ts` - 設定統合HTTPサーバー
- `tests/unit/remote-config-loader.test.ts` - 17 tests
- `tests/unit/secret-auth.test.ts` - 23 tests
- `tests/unit/jwt-middleware.test.ts` - 19 tests
- `tests/unit/http-server-auth.test.ts` - 14 tests
- `tests/e2e/remote-auth.test.ts` - 9 tests