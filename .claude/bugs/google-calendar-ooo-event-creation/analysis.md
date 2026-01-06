# Bug Analysis

## Root Cause Analysis

### Investigation Summary
コードベースを調査した結果、**ハンドラーレベルでは完全に実装済み**であることが判明した。問題は`src/index.ts`のMCPツール定義（Zodスキーマ）に`eventType`関連パラメータが含まれていないことにある。

### Root Cause
**`src/index.ts:496-534`のツール定義で`eventType`とその関連パラメータがZodスキーマに定義されていない。**

MCPクライアント（Claude Code）は`create_calendar_event`ツールのパラメータとして以下のみを認識している：
- `title`, `startDate`, `endDate`, `location`, `notes`, `calendarName`, `alarms`, `preferredSource`

しかし、ハンドラー（`src/tools/calendar/handlers.ts`）は以下のパラメータを既に受け入れ・処理できる：
- `eventType`, `autoDeclineMode`, `declineMessage`, `chatStatus`
- `workingLocationType`, `workingLocationLabel`, `birthdayType`

### Contributing Factors
- ツール定義（`src/index.ts`）とハンドラー入力型（`CreateCalendarEventInput`）の間の不整合
- ハンドラーにパラメータを追加した際に、ツール定義のZodスキーマを更新し忘れた

## Technical Details

### Affected Code Locations

1. **File**: `src/index.ts`
   - **Lines**: `496-534`
   - **Issue**: `create_calendar_event`ツールのZodスキーマに`eventType`関連パラメータが定義されていない

2. **File**: `src/tools/calendar/handlers.ts`
   - **Lines**: `103-145` (`CreateCalendarEventInput`インターフェース)
   - **Status**: ✅ 完全に実装済み - `eventType`, `autoDeclineMode`等のすべてのパラメータが定義されている
   - **Lines**: `588-806` (`handleCreateCalendarEvent`関数)
   - **Status**: ✅ 完全に実装済み - すべてのeventTypeを処理するロジックが存在

3. **File**: `src/integrations/google-calendar-service.ts`
   - **Lines**: `135-155` (`CreateEventRequest`インターフェース)
   - **Status**: ✅ 完全に実装済み
   - **Lines**: `275-353` (`buildEventTypePayload`メソッド)
   - **Status**: ✅ 完全に実装済み - Google Calendar APIへの変換ロジックが存在

### Data Flow Analysis
```
MCP Client (Claude Code)
    ↓ [create_calendar_event ツール呼び出し]
    ↓ ⚠️ Zodスキーマ: eventType パラメータなし → パラメータ渡せない
src/index.ts (ツール定義)
    ↓
src/tools/calendar/handlers.ts (handleCreateCalendarEvent)
    ↓ ✅ eventType 処理ロジックあり
src/integrations/google-calendar-service.ts
    ↓ ✅ eventType → Google API フォーマット変換あり
Google Calendar API
```

### Dependencies
- `zod`: ツールパラメータのスキーマ定義とバリデーション
- `@modelcontextprotocol/sdk`: MCPサーバー・ツール登録

## Impact Analysis

### Direct Impact
- OOO（Out of Office）イベントが作成できない
- Focus Timeイベントが作成できない
- Working Locationイベントが作成できない
- Birthdayイベントが作成できない

### Indirect Impact
- 休暇設定時の自動辞退機能が利用できない
- Deep Work時間の設定ができない

### Risk Assessment
修正リスク: **低**
- 既存のコードを変更するのではなく、パラメータを追加するだけ
- ハンドラーは既に完全に実装されているため、APIレベルの変更は不要
- 後方互換性あり（既存パラメータは変更なし、新パラメータはオプショナル）

## Solution Approach

### Fix Strategy
`src/index.ts`の`create_calendar_event`ツール定義に不足しているZodスキーマパラメータを追加する。

### Changes Required

**File**: `src/index.ts` (Lines 496-534)

追加するパラメータ:
```typescript
eventType: z
  .enum(['default', 'outOfOffice', 'focusTime', 'workingLocation', 'birthday'])
  .optional()
  .describe("Event type: 'default' (normal event), 'outOfOffice' (vacation/OOO), 'focusTime' (deep work), 'workingLocation', 'birthday'. Default: 'default'"),

autoDeclineMode: z
  .enum(['declineNone', 'declineAllConflictingInvitations', 'declineOnlyNewConflictingInvitations'])
  .optional()
  .describe("For outOfOffice/focusTime: auto-decline mode for conflicting invitations"),

declineMessage: z
  .string()
  .optional()
  .describe("For outOfOffice/focusTime: custom message sent when auto-declining"),

chatStatus: z
  .enum(['available', 'doNotDisturb'])
  .optional()
  .describe("For focusTime: Google Chat status during focus time"),

workingLocationType: z
  .enum(['homeOffice', 'officeLocation', 'customLocation'])
  .optional()
  .describe("For workingLocation: type of work location"),

workingLocationLabel: z
  .string()
  .optional()
  .describe("For workingLocation: optional label for the location"),

birthdayType: z
  .enum(['birthday', 'anniversary', 'other'])
  .optional()
  .describe("For birthday: type of birthday event"),
```

### Alternative Solutions
なし - これが唯一かつ最小限の修正方法

### Risks and Trade-offs
- **リスク**: ほぼなし。新しいオプショナルパラメータの追加のみ
- **後方互換性**: 完全に維持される（既存のパラメータは変更なし）

## Implementation Plan

### Changes Required

1. **Change 1**: ZodスキーマにeventType関連パラメータを追加
   - File: `src/index.ts`
   - Lines: 496-534 内
   - Modification: 7つの新しいZodパラメータを追加

2. **Change 2**: ハンドラー呼び出しに新パラメータを渡す
   - File: `src/index.ts`
   - Lines: 523-533
   - Modification: `handleCreateCalendarEvent`呼び出しに新パラメータを追加

### Testing Strategy
1. 既存のユニットテストが通ることを確認
2. 新しいパラメータを使用したイベント作成のテストを追加
3. `npm run build && npm test` で全テスト通過を確認

### Rollback Plan
Git revertで簡単にロールバック可能（単一ファイルの変更のみ）

---
**Status**: Analysis Complete
**Next Step**: `/bug-fix` で修正を実装
