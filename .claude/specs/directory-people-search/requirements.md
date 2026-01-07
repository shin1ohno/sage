# Requirements Document: Directory People Search

## Introduction

Google Workspace のディレクトリから参加者（ユーザー）を名前やメールアドレスで検索する機能を追加します。これにより、カレンダーイベントに参加者を追加する際に、メールアドレスを正確に覚えていなくても名前で検索して追加できるようになります。

## Alignment with Product Vision

この機能は sage の Calendar Integration 機能を強化し、以下の product.md の目標をサポートします：

- **エンジニアの生産性向上**: 参加者のメールアドレスを覚えていなくても、名前で検索して会議に追加できる
- **カレンダー管理の効率化**: `create_calendar_event` の使い勝手を向上

## Requirements

### Requirement 1: ディレクトリ検索

**User Story:** As a sage ユーザー, I want 組織のディレクトリから名前やメールアドレスでユーザーを検索できる, so that カレンダーイベントに参加者を簡単に追加できる

#### Acceptance Criteria

1. WHEN ユーザーが `search_directory_people` ツールを `query` パラメータで実行する THEN システム SHALL Google People API を使用してディレクトリを検索し、マッチするユーザーのリストを返す

2. WHEN 検索クエリがユーザー名の一部と一致する THEN システム SHALL 名前、メールアドレス、所属部署を含む検索結果を返す

3. IF 検索結果が見つからない THEN システム SHALL 空のリストと適切なメッセージを返す

4. WHEN 検索結果が多数ある THEN システム SHALL 最大50件までの結果を返し、ページネーション情報を含める

### Requirement 2: OAuth スコープ管理

**User Story:** As a sage ユーザー, I want People API のスコープが自動的に認証フローに含まれる, so that 追加の設定なしでディレクトリ検索を使用できる

#### Acceptance Criteria

1. WHEN Google OAuth 認証を実行する THEN システム SHALL `directory.readonly` スコープを認証リクエストに含める

2. IF ユーザーが既に認証済みで新しいスコープが必要な場合 THEN システム SHALL 再認証が必要であることを通知する

3. WHEN 新しいスコープで認証する THEN システム SHALL 既存の Calendar API スコープも維持する

### Requirement 3: エラーハンドリング

**User Story:** As a sage ユーザー, I want People API が利用できない場合に適切なエラーメッセージを受け取る, so that 問題の原因を理解して対処できる

#### Acceptance Criteria

1. IF People API が Google Cloud Console で有効化されていない THEN システム SHALL 「People API を有効化してください」というメッセージとセットアップ手順を返す

2. IF ディレクトリ共有が組織で無効化されている THEN システム SHALL 「組織のディレクトリ共有が無効です。Google Workspace 管理者に連絡してください」というメッセージを返す

3. IF OAuth スコープが不足している THEN システム SHALL 再認証を促すメッセージを返す

### Requirement 4: 検索結果の形式

**User Story:** As a sage ユーザー, I want 検索結果が構造化された形式で返される, so that 結果を理解して次のアクションを取りやすい

#### Acceptance Criteria

1. WHEN 検索が成功する THEN システム SHALL 各ユーザーについて以下の情報を返す:
   - 表示名（displayName）
   - メールアドレス（emailAddress）
   - 部署/組織（organization）（利用可能な場合）

2. WHEN 検索結果を返す THEN システム SHALL 結果の総数と返された件数を含める

3. WHEN カレンダーイベント作成に使用する THEN システム SHALL メールアドレスを `create_calendar_event` の `attendees` パラメータに直接使用可能な形式（例: `["user@example.com"]`）で提供する

## Non-Functional Requirements

### Performance
- 検索レスポンスは 3 秒以内に返す
- 最大 50 件の結果を効率的に処理する

### Security
- OAuth 2.0 認証を使用し、最小限のスコープ（`directory.readonly`）のみを要求
- ユーザーの認証情報を安全に保存（既存の暗号化メカニズムを使用）

### Reliability
- People API の一時的なエラーに対してリトライを実装（既存の `retryWithBackoff` パターンを使用）
- オフライン時や API 障害時の適切なエラーハンドリング

### Usability
- 検索クエリは名前の一部でもマッチする（前方一致）
- 日本語名での検索をサポート
- 結果は関連性の高い順にソート
