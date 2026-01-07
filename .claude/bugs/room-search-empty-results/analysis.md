# Bug Analysis

## Root Cause Analysis

### Investigation Summary

1. `search_room_availability` ツールを実行すると空の配列が返される
2. 現在の実装は `CalendarList API` (`calendarList.list`) を使用して会議室を検索
3. しかし、**CalendarList API はユーザーが個人的にサブスクライブしたカレンダーのみを返す**
4. Google Workspaceの会議室リソースは、ユーザーのカレンダーリストにデフォルトでは含まれない

### Root Cause

**CalendarList API の誤用**

現在の実装（`src/integrations/google-calendar-room-service.ts:166-189`）:

```typescript
const response = await client.calendarList.list({
  maxResults: 250,
  pageToken,
  showHidden: true,
});
```

この API は:
- ユーザーが**自分のカレンダーリストに追加した**カレンダーのみを返す
- 会議室リソースはデフォルトでカレンダーリストに含まれない
- `@resource.calendar.google.com` サフィックスを持つカレンダーをフィルタリングしても、そもそもリストに含まれていない

**正しいAPI**: Google Workspace の会議室リソースを列挙するには **Admin SDK Directory API** を使用する必要がある。

### Contributing Factors

1. **ドキュメントの誤解**: CalendarList API が会議室を含むと誤解した可能性
2. **テスト環境の制約**: 単体テストではモックを使用しており、実際のGoogle Workspace環境での検証が不十分
3. **スコープの不足**: 現在のOAuthスコープ（`calendar`, `calendar.readonly`）では Directory API を呼び出せない

---

## Directory API 権限要件の詳細調査

### 結論: 通常ユーザーでは Directory API を呼び出せない

**Admin SDK Directory API** (`resources.calendars.list`) は**管理者専用API**です。

通常の Google Workspace ユーザー（非管理者）がこのAPIを呼び出すと、**HTTP 403 Forbidden** が返されます。

### 必要な権限

APIを呼び出すには、以下の**いずれか**が必要:

#### Option A: ユーザーに限定的な管理者権限を付与

**設定手順** (Super Admin が実施):

1. **カスタムロールの作成**
   - Admin console (admin.google.com) → Account → Admin roles and privileges
   - 「+ Create new role」をクリック
   - 名前: 例「Resource Viewer」
   - 権限: **Directory → Buildings and resources → View resources** のみ選択
   - 「Create role」で保存

2. **ロールの割り当て**
   - 作成したロールを選択 → Role assignments
   - 対象ユーザーまたはグループに割り当て

**メリット**:
- 既存のOAuth認証フローを使用できる
- ユーザーごとに権限を制御可能

**デメリット**:
- 各ユーザー（または sage を使うユーザー全員）に管理者ロールを付与する必要がある
- Workspace 管理者の協力が必須

#### Option B: サービスアカウント + Domain-Wide Delegation

**設定手順**:

1. **Google Cloud Console でサービスアカウント作成**
   - IAM & Admin → Service accounts → New
   - Admin SDK API を有効化
   - JSON キーをダウンロード
   - 「Domain-wide delegation」を有効化
   - Client ID をメモ

2. **Workspace Admin Console で委任設定**
   - Security → Access & data control → API controls → Domain-wide delegation
   - 「Add new」でサービスアカウントの Client ID を追加
   - スコープ: `https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly`

3. **委任先ユーザーの設定**
   - サービスアカウントが「impersonate」する管理者ユーザーを指定
   - そのユーザーには「Buildings and resources - Read」権限が必要

**メリット**:
- エンドユーザーに管理者権限を付与する必要がない
- バックエンドで完結（ユーザー同意画面なし）

**デメリット**:
- アーキテクチャの大幅変更が必要（サービスアカウント認証への移行）
- サービスアカウントキーの安全な管理が必要
- Workspace 管理者の協力が必須

---

## Technical Details

### Affected Code Locations

- **File**: `src/integrations/google-calendar-room-service.ts`
  - **Method**: `fetchRoomResources()` (L159-193)
  - **Issue**: CalendarList API を使用しているが、会議室リソースは含まれない

- **File**: `src/oauth/google-oauth-handler.ts`
  - **Lines**: 48-51
  - **Issue**: Directory API に必要なスコープ (`admin.directory.resource.calendar.readonly`) が含まれていない

### Data Flow Analysis

```
現在のフロー:
searchRoomAvailability()
  → fetchRoomResources()
    → calendarList.list()  ← 会議室が含まれない
    → isRoomCalendar() でフィルタ ← フィルタ対象がゼロ
  → 空配列を返す

期待されるフロー (Directory API):
searchRoomAvailability()
  → fetchRoomResources()
    → admin.directory.resources.calendars.list()  ← 会議室リソースを取得
  → queryFreebusy() で空き状況を確認
  → 利用可能な会議室リストを返す
```

---

## Solution Options

### Option A: Directory API + ユーザー管理者権限

| 項目 | 内容 |
|------|------|
| 技術的難易度 | 中 |
| 管理者設定 | ユーザーに「Resource Viewer」ロールを付与 |
| コード変更 | OAuthスコープ追加 + Directory API 実装 |
| UX | 最良（完全自動で会議室検索） |
| 制約 | 各ユーザーに管理者ロール必要 |

### Option B: Directory API + サービスアカウント

| 項目 | 内容 |
|------|------|
| 技術的難易度 | 高 |
| 管理者設定 | サービスアカウント + Domain-Wide Delegation |
| コード変更 | 認証アーキテクチャの大幅変更 |
| UX | 最良（完全自動で会議室検索） |
| 制約 | サービスアカウントキーの管理 |

### Option C: 手動追加のドキュメント案内（暫定対応）

| 項目 | 内容 |
|------|------|
| 技術的難易度 | なし |
| 管理者設定 | 不要 |
| コード変更 | なし |
| UX | ユーザーが手動で会議室をカレンダーに追加する必要あり |
| 制約 | 根本解決ではない |

**手順**:
1. Google Calendar UI で「他のカレンダー」→「カレンダーに登録」
2. 会議室のメールアドレス（例: `room-101@resource.calendar.google.com`）を入力
3. 追加後、sage の `search_room_availability` で検出可能になる

---

## 推奨アプローチ

### 短期: Option C（ドキュメント対応）
- 即座に対応可能
- 管理者設定不要
- ドキュメントで手順を案内

### 中長期: Option A（Directory API + 限定管理者権限）
- Workspace 管理者と調整
- 「Resource Viewer」ロールを sage ユーザーグループに付与
- コード変更を実施

---

## Implementation Plan (Option A を採用する場合)

### Changes Required

1. **OAuthスコープの追加**
   - File: `src/oauth/google-oauth-handler.ts`
   - 追加: `'https://www.googleapis.com/auth/admin.directory.resource.calendar.readonly'`
   - 注意: 既存ユーザーは再認証が必要

2. **Directory API クライアントの追加**
   - File: `src/integrations/google-calendar-service.ts` または新規ファイル
   - `google.admin('directory_v1')` クライアントを初期化

3. **fetchRoomResources() の書き換え**
   - File: `src/integrations/google-calendar-room-service.ts`
   - `admin.resources().calendars().list({ customer: 'my_customer' })` を使用
   - 返却データ構造を `RoomResource` にマッピング

4. **エラーハンドリングの追加**
   - 権限不足 (403) の場合、わかりやすいエラーメッセージを表示
   - Option C の手順を案内

5. **テストの更新**
   - File: `tests/unit/google-calendar-room-service.test.ts`
   - Directory API のモックを追加

### Testing Strategy

1. Directory API が利用可能かどうかの確認テスト
2. 権限不足時のエラーハンドリングテスト
3. 会議室リソースの取得テスト
4. フィルタリング（容量、建物、階）のテスト
5. Freebusy API との統合テスト

---

## 決定事項

**採用オプション: Option C（ドキュメント対応）**

理由:
- 管理者設定が不要
- 即座に対応可能
- コード変更なし

対応内容:
1. ドキュメントに会議室の手動追加手順を記載
2. `search_room_availability` のエラーメッセージを改善（手順を案内）
3. 将来的に Option A への移行を検討可能
