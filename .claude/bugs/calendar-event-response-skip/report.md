# Bug Report

## Bug Summary
カレンダーイベントへの返答（respond_to_calendar_event / respond_to_calendar_events_batch）を実行すると、招待されているイベントにも関わらず「出席者なし（個人の予定）」としてスキップされてしまう。

## Bug Details

### Expected Behavior
招待されているカレンダーイベントに対して、accept/decline/tentative の返答ができること。

### Actual Behavior
全てのイベントが「出席者なしのためスキップ」と判定され、返答処理がスキップされる。

### Steps to Reproduce
1. Google Calendar で招待されているイベントがある状態で sage を起動
2. `respond_to_calendar_events_batch` または `respond_to_calendar_event` を実行
3. 招待されているにも関わらず「出席者なし（個人の予定）」としてスキップされる

### Environment
- **Version**: 1.0.0
- **Platform**: Linux / macOS
- **Configuration**: Google Calendar 連携が有効

## Impact Assessment

### Severity
- [x] High - Major functionality broken

カレンダーイベントへの返答機能が全く使えない状態。

### Affected Users
全ての sage ユーザー（Google Calendar 連携使用者）

### Affected Features
- `respond_to_calendar_event` MCP ツール
- `respond_to_calendar_events_batch` MCP ツール

## Additional Context

### Error Messages
```
すべてのイベントが「出席者なし（個人の予定）」としてスキップされました。
理由:
これらのイベントは以下のいずれかの可能性があります：
    1.    他人のカレンダーから共有されている読み取り専用イベント
    2.    招待ではなく、自分で作成した個人イベント
    3.    既に返答済みのイベント
```

### Screenshots/Media
N/A

### Related Issues
N/A

## Initial Analysis

### Suspected Root Cause
~~出席者（attendees）の有無を判定するロジックに問題がある可能性~~

### 🔴 確定した根本原因

**単一イベント API とバッチ API で異なるサービスを使用している**

| API | 使用サービス | 結果 |
|-----|------------|------|
| `respond_to_calendar_event` | `CalendarSourceManager.respondToEvent()` → Google Calendar API | ✅ 成功 |
| `respond_to_calendar_events_batch` | `CalendarEventResponseService.respondToEventsBatch()` → **EventKit のみ** | ❌ 失敗 |

**バグの流れ**:
1. バッチ API が EventKit 経由でイベント詳細を取得しようとする (`calendar-event-response.ts:386`)
2. Google Calendar のイベント ID は EventKit で見つからない
3. `fetchEventDetails` がエラーをキャッチして `hasAttendees: false` を返す (`calendar-event-response.ts:411-418`)
4. `canRespondToEvent` で「出席者なし」と判定されスキップ (`calendar-event-response.ts:203-207`)

### 問題箇所

**`src/tools/calendar/handlers.ts:547`**
```typescript
// バッチ API は EventKit のみを使用している！
const result = await calendarEventResponseService!.respondToEventsBatch({
  eventIds,
  response,
  comment,
});
```

**対照的に、単一 API は CalendarSourceManager を経由:**
**`src/tools/calendar/handlers.ts:430`**
```typescript
const result = await calendarSourceManager!.respondToEvent(
  eventId,
  response,
  source === 'google' ? 'google' : undefined,
  calendarId
);
```

### Affected Components
- `src/tools/calendar/handlers.ts:515-569` - バッチハンドラーの実装
- `src/integrations/calendar-event-response.ts` - EventKit のみ対応
- `src/integrations/calendar-source-manager.ts` - Google Calendar 対応あり

### 修正方針
バッチ API も `CalendarSourceManager` を経由して Google Calendar API を使用するように変更する
