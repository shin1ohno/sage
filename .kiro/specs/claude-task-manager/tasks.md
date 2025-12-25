# 実装計画

> **TDD原則**: 各タスクは「テスト作成 → 実装 → リファクタリング」の順で進める
> **マルチプラットフォーム**: Desktop/Code (MCP)、iOS/iPadOS (Remote MCP)、Web (Remote MCP) 対応

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

## 将来実装予定のタスク

- [x] 20. Remote MCPサーバーの実装
- [x] 20.1 Remote MCPサーバー基盤を実装
  - ✅ **テスト**: `tests/unit/remote-mcp-server.test.ts`実装済み
  - ✅ HTTP/HTTPS API endpoints実装済み
  - ✅ MCP protocol over HTTP実装済み（JSONRPCRequest/Response）
  - ✅ 認証とセッション管理実装済み（SessionManager, AuthConfig）
  - _要件: 12.1, 12.2, 12.3_

- [x] 20.2 クラウドデプロイメント設定を実装
  - ✅ Dockerfile実装済み
  - ✅ docker-compose.yml実装済み
  - ✅ 環境変数とシークレット管理対応済み
  - _要件: 12.7_

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
  - ✅ Dockerfile実装済み
  - ✅ docker-compose.yml実装済み
  - ✅ wrangler.toml（Cloudflare Workers設定）実装済み
  - ✅ CI/CDパイプライン設定済み（.github/workflows/）
  - _要件: 12.7, 12.8_

- [x] 28. 開発者ドキュメントを作成
  - ✅ マルチプラットフォームアーキテクチャの説明（docs/ARCHITECTURE.md）
  - ✅ プラットフォーム別拡張とカスタマイズガイド
  - _要件: 全要件の実装ガイド_

- [x] 29. 配布パッケージを作成
  - ✅ MCP版パッケージ設定済み（package.json、manifest.json）
  - ✅ Remote MCP Server用のDocker設定済み（Dockerfile、docker-compose.yml）
  - ✅ npm publish設定済み（.github/workflows/publish.yml）
  - ✅ MCPB build設定済み（.github/workflows/mcpb.yml）
  - _要件: 7.1, 7.2, 7.3_