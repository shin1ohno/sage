# タスク指示書: Meeting Intelligence Pipeline — Layer 4: Google Drive Integration (Task 15)

## 概要

Meeting Intelligence Pipeline の Google Drive 統合レイヤー。Gemini Meet トランスクリプトを Google Drive から取得するための GoogleDriveService を実装する。後続レイヤーの PostMeetingProcessor がこのサービスに依存する。

## 参照資料

- `.spec-workflow/specs/meeting-intelligence-pipeline/tasks.md` — タスク定義（ソース・オブ・トゥルース）
- `.spec-workflow/specs/meeting-intelligence-pipeline/design.md` — 設計文書（Components and Interfaces セクション: GoogleDriveService）
- `.spec-workflow/specs/meeting-intelligence-pipeline/requirements.md` — 要件文書（R2）

## 作業内容

### Task 15: GoogleDriveService 作成

- **優先度:** 高
- **ファイル:** `src/integrations/google-drive-service.ts`（新規）
- **作業:** Google Drive API クライアントサービスを作成。Gemini Meet トランスクリプトの検索・取得を行う

#### ローカル型定義

```typescript
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}
```

#### GoogleDriveService クラス

```typescript
export class GoogleDriveService {
  constructor(oauthHandler: GoogleOAuthHandler)

  // イベントに対応する Gemini Meet トランスクリプトを検索
  async findTranscript(event: CalendarEvent): Promise<DriveFile | null>

  // ファイルのテキストコンテンツを取得
  async getFileContent(fileId: string): Promise<string>

  // drive.readonly スコープが付与されているかどうか
  isAvailable(): boolean
}
```

#### 実装詳細

- **コンストラクタ:**
  - `GoogleOAuthHandler` を受け取り保持
  - `available: boolean` フラグを `false` で初期化
  - `drive` クライアントインスタンスは持たない（遅延初期化）

- **Drive クライアントの遅延初期化 (`ensureDriveClient()` private メソッド):**
  - `GoogleCalendarService.authenticate()` パターン（L279-303）を踏襲
  - `oauthHandler.ensureValidToken()` を呼んでトークンを有効化
  - `oauthHandler.getTokens()` でトークンを取得
  - トークンがない場合は `Error` を throw
  - **スコープチェック:** `tokens.scope` 配列に `'https://www.googleapis.com/auth/drive.readonly'` が含まれるか確認
    - 含まれない場合: `available = false`、`Error` を throw（メッセージ: `'Google Drive scope not granted. Please re-authenticate with Google to enable transcript access.'`）
    - 含まれる場合: `available = true`
  - `oauthHandler.getOAuth2Client(tokens)` で OAuth2Client を取得
  - `google.drive({ version: 'v3', auth: oauth2Client })` で Drive クライアントを初期化して返す

- **`findTranscript(event)`:**
  - `event.conferenceData` が `undefined` または `conferenceData.conferenceId` が `undefined` の場合は即座に `null` を返す（EventKit イベントまたは Meet なしのイベント — R2.5）
  - `ensureDriveClient()` で Drive クライアントを取得
  - **トランスクリプト検索戦略:**
    - Gemini Meet トランスクリプトは Google Docs（`application/vnd.google-apps.document`）として Drive に保存される
    - 検索クエリ: `mimeType='application/vnd.google-apps.document' and fullText contains '{conferenceId}' and modifiedTime > '{searchStartTime}'`
    - `searchStartTime`: `event.start` の 1 時間前（ISO 8601）
    - `drive.files.list` で検索（fields: `'files(id, name, mimeType, modifiedTime)'`）
    - 結果が見つからない場合のフォールバック: 会議タイトルで検索
      - クエリ: `mimeType='application/vnd.google-apps.document' and name contains '{sanitizedTitle}' and modifiedTime > '{searchStartTime}' and modifiedTime < '{searchEndTime}'`
      - `searchEndTime`: `event.end` の 2 時間後
      - `sanitizedTitle`: イベントタイトルから特殊文字を除去（`'` → `\'` エスケープ）
    - どちらも見つからない場合は `null` を返す（R2.3）
    - 複数見つかった場合は `modifiedTime` が最新のものを返す
  - `retryWithBackoff` でラップ
  - ログ: 検索開始・結果（found/not found）・フォールバック使用をログ出力

- **`getFileContent(fileId)`:**
  - `ensureDriveClient()` で Drive クライアントを取得
  - `drive.files.export({ fileId, mimeType: 'text/plain' })` でプレーンテキストとしてエクスポート（Google Docs → text/plain）
  - レスポンスの `data` をストリングとして返す
  - `retryWithBackoff` でラップ

- **`isAvailable()`:**
  - `available` フラグを返す
  - **注意:** このメソッドは同期。スコープチェックは `ensureDriveClient()` 呼び出し時に行われるため、初回 API 呼び出し前は `false` を返す

- **エラーハンドリング:**
  - 全 API 呼び出しで `retryWithBackoff` を使用
  - 401/403 エラー（`'invalid_grant'`, `'UNAUTHENTICATED'`）の検知: `available = false` に設定し、Error を throw
  - ファイルが見つからない場合（404）: `null` を返す（`getFileContent` では Error を throw）

- **依存:** `googleapis` (google.drive), `GoogleOAuthHandler`, `retryWithBackoff` (`src/utils/retry.ts`), `createLogger` (`src/utils/logger.ts`), `CalendarEvent` (`src/types/google-calendar-types.ts`)
- **パターン:** `GoogleCalendarService` の認証パターン（L254-303）を踏襲
- **要件:** R2.1, R2.2, R2.3, R2.4, R2.5

---

## テスト

- **テストファイル配置:** `tests/unit/` 配下
- **テストファイル:** `tests/unit/google-drive-service.test.ts`

### テスト項目

#### コンストラクタ・初期化
- `isAvailable`: 初期状態で `false` を返す
- `ensureDriveClient`: drive.readonly スコープがない場合にエラーを throw し `isAvailable()` が `false` のまま
- `ensureDriveClient`: drive.readonly スコープがある場合に Drive クライアントを初期化し `isAvailable()` が `true` になる
- `ensureDriveClient`: トークンがない場合にエラーを throw

#### findTranscript
- `findTranscript`: `event.conferenceData` が `undefined` の場合に `null` を返す（API 呼び出しなし）
- `findTranscript`: `conferenceData.conferenceId` が `undefined` の場合に `null` を返す
- `findTranscript`: conferenceId で Google Docs を検索し、見つかった場合に `DriveFile` を返す
- `findTranscript`: conferenceId で見つからない場合にイベントタイトルでフォールバック検索
- `findTranscript`: どちらの検索でも見つからない場合に `null` を返す
- `findTranscript`: 複数の結果がある場合に最新の `modifiedTime` のファイルを返す
- `findTranscript`: retryWithBackoff でラップされている

#### getFileContent
- `getFileContent`: `drive.files.export` を `text/plain` で呼び出す
- `getFileContent`: エクスポートされたテキストコンテンツを返す
- `getFileContent`: retryWithBackoff でラップされている

#### エラーハンドリング
- 401/403 エラー時に `available` が `false` になる
- Drive API エラー時に適切にエラーを throw

### テストのモックパターン

```typescript
// googleapis のモック
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => mockOAuth2Client),
    },
    drive: jest.fn().mockReturnValue(mockDriveClient),
  },
}));

// GoogleOAuthHandler のモック
const mockOAuthHandler = {
  ensureValidToken: jest.fn().mockResolvedValue('mock-access-token'),
  getTokens: jest.fn().mockResolvedValue({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: Date.now() + 3600000,
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/directory.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  }),
  getOAuth2Client: jest.fn().mockReturnValue(mockOAuth2Client),
};
```

### 既存テスト
- **全既存テストがパスすることを確認:** `npm test`

## 横断的懸念事項

- **ESM import:** 全 import は `.js` 拡張子付き（例: `import { GoogleOAuthHandler } from '../oauth/google-oauth-handler.js'`）
- **ロギング:** `createLogger('google-drive')` を使用
- **エラーハンドリング:** `retryWithBackoff` を全 API 呼び出しに使用
- **Google Drive API のクエリ構文:** シングルクォートのエスケープが必要（`'` → `\'`）

## Open Questions

なし
