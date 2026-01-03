# Requirements Document: Google Calendar API Integration

## Introduction

Google Calendar API統合により、Sageユーザーは複数のカレンダーサービス（Apple Calendar/EventKitとGoogle Calendar）を統一的に管理できるようになります。ユーザーはEventKit、Google Calendar、または両方を選択でき、プラットフォームに応じて最適なソースが自動選択されます。

**目的**:
- **マルチプラットフォーム対応**: Linux/WindowsでもカレンダーアクセスをGoogle Calendar経由で提供
- **柔軟なソース選択**: EventKit単独、Google Calendar単独、または両方を併用可能
- **自動フォールバック**: 片方のソースでエラーが発生しても他方で継続動作
- **統一インターフェース**: どのソースを使用しても同じMCPツールで操作

**ユーザーへの価値**:
- **プラットフォーム非依存**: macOS以外（Linux/Windows）でもカレンダー統合が利用可能
- **選択の自由**: ユーザーが好みのカレンダーサービスを選択
- **シームレスな統合**: Google Workspaceユーザーは既存ワークフローをそのまま利用
- **冗長性**: 複数ソースを有効化することで可用性向上

## Alignment with Product Vision

**spec.mdとの整合性**:
Sageの目標は「タスク管理、優先順位付け、リマインド設定、カレンダー統合を自動化し、個人の作業パターンを学習してパーソナライズされたタスク整理とスケジューリング推奨を提供する」ことです。

Google Calendar API統合は以下の点でビジョンを支援します:
1. **プラットフォーム拡張**: macOS以外のプラットフォームでもカレンダー統合を提供
2. **統合強化**: Google Workspaceユーザーのワークフロー改善
3. **柔軟性**: ユーザーが好みのカレンダーサービスを選択可能

**既存アーキテクチャとの整合性** (architecture.md):
- 既存のプラットフォーム抽象化レイヤーを活用
- OAuth 2.1認証基盤を再利用
- MCPツールパターンに従った一貫したインターフェース

## Requirements

### Requirement 1: Google Calendar OAuth認証

**User Story:** エンジニアとして、Google Calendarへの安全なアクセスを許可したい。そうすれば、Sageが私のカレンダーを管理できる。

#### Acceptance Criteria

1. WHEN ユーザーが初回Google Calendar統合を設定 THEN システムはGoogle OAuth同意画面にリダイレクトする
2. WHEN ユーザーがGoogle Calendar APIスコープを承認 THEN システムはアクセストークンとリフレッシュトークンを取得する
3. IF トークンが期限切れ THEN システムは自動的にリフレッシュトークンで更新する
4. WHEN 認証が失敗 THEN システムは明確なエラーメッセージと再認証手順を提供する
5. IF ユーザーがアクセスを取り消し THEN システムはGoogle Calendar機能を無効化し、ユーザーに通知する

**技術要件**:
- Google OAuth 2.0スコープ: `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/calendar.readonly`
- 既存OAuth 2.1サーバーとの統合
- トークン暗号化保存（既存TokenServiceを活用）

### Requirement 2: Google Calendarイベント取得

**User Story:** エンジニアとして、Sageで自分のGoogle Calendarイベントを表示したい。そうすれば、すべてのカレンダーを一箇所で確認できる。

#### Acceptance Criteria

1. WHEN ユーザーが指定期間のイベント取得を要求 THEN システムはGoogle Calendar APIからすべてのイベントを取得する
2. IF 複数のGoogle Calendarがある THEN システムはすべてのカレンダーからイベントを集約する
3. WHEN イベント取得中にAPIエラーが発生 THEN システムは最大3回リトライする（指数バックオフ）
4. WHEN イベントが繰り返しイベント THEN システムは指定期間内のすべてのインスタンスを展開する
5. IF ユーザーが特定カレンダーのみ指定 THEN システムはそのカレンダーのイベントのみ返す

**パフォーマンス要件**:
- 取得時間: 30日間のイベントを2秒以内
- ページネーション: 250イベント以上の場合は自動ページング

### Requirement 3: Google Calendarイベント作成

**User Story:** エンジニアとして、Sageから直接Google Calendarにイベントを作成したい。そうすれば、手動でGoogle Calendarを開く必要がない。

#### Acceptance Criteria

1. WHEN ユーザーがイベント作成を要求 THEN システムはタイトル、開始/終了時刻、場所、説明を含むイベントを作成する
2. IF ユーザーが終日イベントを指定 THEN システムは時刻なしで日付のみのイベントを作成する
3. WHEN ユーザーがアラーム/リマインダーを指定 THEN システムは指定された時間のリマインダーを設定する（例: "-15m", "-1h"）
4. IF ユーザーが参加者を追加 THEN システムはイベント招待を送信する
5. WHEN 作成が成功 THEN システムはイベントIDとWebリンクを返す

**データ検証**:
- 開始時刻 < 終了時刻
- ISO 8601日付形式
- タイムゾーン: ユーザー設定または明示的指定

### Requirement 4: Google Calendarイベント更新

**User Story:** エンジニアとして、既存のGoogle Calendarイベントを変更したい。そうすれば、スケジュール変更に対応できる。

#### Acceptance Criteria

1. WHEN ユーザーがイベントIDで更新を要求 THEN システムは指定されたフィールドのみ更新する
2. IF イベントが繰り返しイベント THEN システムはユーザーに単一インスタンスか全シリーズか確認する
3. WHEN 参加者がいるイベントを更新 THEN システムは参加者に通知を送信する
4. IF イベントが他人の主催 THEN システムは更新を拒否し、代わりに返信オプションを提示する

### Requirement 5: Google Calendarイベント削除

**User Story:** エンジニアとして、不要になったGoogle Calendarイベントを削除したい。そうすれば、カレンダーを整理できる。

#### Acceptance Criteria

1. WHEN ユーザーが単一イベントIDで削除を要求 THEN システムはイベントを削除する
2. IF ユーザーが複数イベントIDでバッチ削除を要求 THEN システムはすべて削除する
3. WHEN イベントに参加者がいる場合 THEN システムは削除前に確認を求める
4. IF イベントが繰り返しイベント THEN システムはユーザーに単一インスタンスか全シリーズか確認する
5. WHEN 削除が成功 THEN システムは削除されたイベント数を返す

### Requirement 6: Google Calendarイベント返信

**User Story:** エンジニアとして、招待されたGoogle Calendarイベントに返信したい。そうすれば、参加可否を主催者に伝えられる。

#### Acceptance Criteria

1. WHEN ユーザーがイベントに "accept"/"decline"/"tentative" で返信 THEN システムは参加ステータスを更新する
2. IF ユーザーがバッチ返信を要求 THEN システムは複数イベントに同じステータスを適用する
3. WHEN 返信が成功 THEN システムは主催者に通知を送信する
4. IF ユーザーが主催者の場合 THEN システムは返信を拒否し、代わりに更新を提案する

### Requirement 7: 空き時間スロット検出（マルチソース対応）

**User Story:** エンジニアとして、有効なカレンダーソースから空き時間を検出したい。そうすれば、設定したすべてのカレンダーを考慮してミーティングをスケジュールできる。

#### Acceptance Criteria

1. WHEN ユーザーが空き時間検出を要求 THEN システムは有効化されたカレンダーソース（EventKit、Google Calendar、またはその両方）からイベントを集約する
2. IF EventKitのみ有効 THEN システムはEventKitイベントのみを使用する
3. IF Google Calendarのみ有効 THEN システムはGoogle Calendarイベントのみを使用する
4. IF ユーザーが最小/最大期間を指定 THEN システムはその範囲内のスロットのみ返す
5. WHEN 作業リズム設定がある THEN システムは深い作業日/会議の多い日を考慮する
6. IF 複数のカレンダーソースで同じイベントが重複 THEN システムは重複を排除する

**統合要件**:
- 既存 `find_available_slots` MCPツールを拡張
- 設定に応じてEventKit、Google Calendar、または両方のイベントをマージ
- 統一された `AvailableSlot` データ構造

### Requirement 8: カレンダー同期状態管理（オプション機能）

**User Story:** エンジニアとして、EventKitとGoogle Calendar両方を有効化している場合、同期状態を確認したい。そうすれば、両方が最新であることを保証できる。

#### Acceptance Criteria

1. IF EventKitとGoogle Calendar両方が有効 THEN ユーザーは同期機能を利用できる
2. WHEN ユーザーが同期状態を照会 THEN システムは各ソースの最終同期時刻と成功/失敗を返す
3. IF 同期エラーが発生 THEN システムはエラー内容と推奨アクションを提供する
4. WHEN ユーザーが手動同期を要求 THEN システムは両方向の同期を実行する
5. IF API制限に達した THEN システムは同期を一時停止し、再開時刻を通知する
6. IF 片方のソースのみ有効 THEN 同期機能は無効化され、ユーザーに通知する

**注**: この機能は両方のカレンダーソースが有効な場合のみ利用可能です。

### Requirement 9: 設定管理（カレンダーソース選択）

**User Story:** エンジニアとして、使用するカレンダーソース（EventKit、Google Calendar、または両方）を選択したい。そうすれば、自分のワークフローとプラットフォームに合わせられる。

#### Acceptance Criteria

1. WHEN ユーザーが設定を更新 THEN システムは `~/.sage/config.json` にカレンダー設定を保存する
2. IF ユーザーがEventKitを無効化 THEN システムはEventKitからのイベント取得を停止する
3. IF ユーザーがGoogle Calendarを無効化 THEN システムはGoogle Calendar APIの使用を停止する
4. WHEN 両方のソースが無効 THEN システムは警告を表示し、少なくとも1つを有効化するよう促す
5. IF ユーザーが特定カレンダーを除外 THEN システムはそのカレンダーのイベントを無視する
6. WHEN ユーザーがデフォルトカレンダーを指定 THEN システムはイベント作成時にそれを使用する
7. IF 設定が無効 THEN システムはバリデーションエラーと推奨値を提供する

**設定項目**:
```json
{
  "calendar": {
    "sources": {
      "eventkit": {
        "enabled": true
      },
      "google": {
        "enabled": true,
        "defaultCalendar": "primary",
        "excludedCalendars": ["holidays@group.v.calendar.google.com"],
        "syncInterval": 300,
        "enableNotifications": true
      }
    }
  }
}
```

### Requirement 10: エラーハンドリングとリカバリー

**User Story:** エンジニアとして、Google Calendar APIエラーが発生しても適切に対応してほしい。そうすれば、作業が中断されない。

#### Acceptance Criteria

1. WHEN APIレート制限（429）に達した THEN システムは指数バックオフでリトライする
2. IF 認証エラー（401）が発生 THEN システムはトークン更新を試み、失敗時は再認証を促す
3. WHEN ネットワークエラーが発生 THEN システムは最大3回リトライし、失敗時は詳細エラーを返す
4. IF APIが一時的に利用不可（500, 503） THEN システムはリトライし、EventKitにフォールバックする
5. WHEN エラーが継続 THEN システムはエラーログを記録し、ユーザーにサポート情報を提供する

**リトライ戦略** (既存 `retry.ts` を活用):
- 初期遅延: 500ms
- 最大遅延: 5000ms
- 最大試行回数: 3回
- Jitter追加でThundering herd防止

### Requirement 11: カレンダーソース自動選択とフォールバック

**User Story:** エンジニアとして、プラットフォームとアクセス可能性に基づいて最適なカレンダーソースが自動選択されてほしい。そうすれば、手動設定なしで即座に使い始められる。

#### Acceptance Criteria

1. WHEN システムが初回起動 THEN システムは利用可能なカレンダーソースを自動検出する
2. IF macOSプラットフォーム THEN システムはEventKitをデフォルトで有効化する
3. IF Linux/Windowsプラットフォーム THEN システムはEventKitを無効化し、Google Calendarのみを提案する
4. WHEN Google Calendar認証が完了 THEN システムは自動的にGoogle Calendarを有効化する
5. IF 有効なソースでエラーが発生 THEN システムは他の有効なソースにフォールバックする
6. WHEN フォールバックが発生 THEN システムはユーザーに通知し、エラー内容を記録する
7. IF すべてのソースが利用不可 THEN システムは明確なエラーメッセージと復旧手順を提供する

**自動検出ロジック**:
- **macOS**: EventKit優先、Google Calendarはオプション
- **Linux/Windows**: Google Calendarのみ（EventKit利用不可）
- **Remote MCP**: ホストのプラットフォームに依存

## Non-Functional Requirements

### Performance

- **イベント取得**: 30日間で2秒以内
- **イベント作成**: 1秒以内
- **バッチ操作**: 最大50イベント/リクエスト
- **同期**: 5分間隔（設定可能）
- **API呼び出し**: Google Calendar API制限内（1,000,000 requests/day）

### Security

- **OAuth 2.0認証**: Google推奨のPKCEフロー
- **トークン保存**: 暗号化された永続ストレージ（既存TokenServiceを活用）
- **スコープ最小化**: 必要最小限のカレンダーアクセススコープ
- **HTTPS必須**: すべてのGoogle API通信
- **トークンローテーション**: リフレッシュトークンの自動更新

### Reliability

- **API障害時フォールバック**: EventKitへの自動切り替え（macOS）
- **データ整合性**: 同期失敗時のロールバック
- **冪等性**: 同じリクエストの重複実行を防止
- **障害リカバリー**: 部分的失敗時の自動リトライ

### Usability

- **統一インターフェース**: EventKitと同じMCPツールパターン
- **明確なエラーメッセージ**: ユーザーが理解できる説明とアクション
- **設定ウィザード**: 初回セットアップのガイド
- **進行状況フィードバック**: 長時間操作のステータス表示

### Compatibility

- **プラットフォーム**: macOS, Linux, Windows（Node.js 18+）
- **既存統合との共存**: EventKit統合に影響しない
- **Google Workspaceバージョン**: すべての個人/組織アカウント
- **API互換性**: Google Calendar API v3

### Testability

- **ユニットテスト**: すべてのサービスクラス（95%以上カバレッジ）
- **統合テスト**: Google API mocksを使用
- **E2Eテスト**: 実際のGoogle Calendarテストアカウント
- **プラットフォームテスト**: macOS/Linux両方でCI/CD実行

## Technical Constraints

1. **Google Calendar API制限**:
   - 1,000,000 requests/day（プロジェクトあたり）
   - 10,000 requests/100 seconds/user
   - バッチリクエスト最大50操作

2. **既存アーキテクチャ依存**:
   - TypeScript strict mode
   - Zod validation
   - MCP SDK 1.0.4+
   - 既存OAuth 2.1サーバー

3. **データ制約**:
   - イベントタイトル: 最大1024文字
   - 説明: 最大8192文字
   - 参加者: 最大2000人/イベント

## Dependencies

### External APIs
- **Google Calendar API v3**: イベント管理
- **Google OAuth 2.0**: 認証

### npm Packages
- `googleapis`: "^134.0.0" (新規追加)
- `@modelcontextprotocol/sdk`: "^1.0.4" (既存)
- `zod`: "^3.23.8" (既存)

### Internal Services
- OAuth 2.1 Server (`src/oauth/`)
- Token Service (`src/oauth/token-service.ts`)
- Retry Utility (`src/utils/retry.ts`)
- Calendar Service (`src/integrations/calendar-service.ts`)

## Success Metrics

1. **機能完成度**: 全10要件が実装され、テスト済み
2. **パフォーマンス**: 95%のAPI呼び出しが2秒以内に完了
3. **信頼性**: 99%のAPI呼び出しが成功（リトライ含む）
4. **テストカバレッジ**: コードカバレッジ95%以上
5. **ユーザー満足度**: クロスプラットフォームカレンダーアクセスの提供

## Future Enhancements

- Google Meetリンク自動生成
- Google Tasksとの統合
- 添付ファイルサポート
- カレンダー共有管理
- 詳細な同期ログとダッシュボード
