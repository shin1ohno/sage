# Bug Report

## Bug Summary
会議室検索（`search_room_availability`）が常に空の結果を返す。Google Calendar UIでは会議室が表示されるにも関わらず、sageからは会議室リソースが取得できない。

## Bug Details

### Expected Behavior
`search_room_availability` ツールを実行すると、Google Workspaceに登録されている会議室リソースが検索され、指定時間帯で利用可能な会議室のリストが返される。

### Actual Behavior
検索条件に関わらず、常に空の配列が返される:
```json
{
  "success": true,
  "rooms": [],
  "message": "指定された条件に一致する空き会議室が見つかりませんでした。別の時間帯をお試しください。"
}
```

### Steps to Reproduce
1. sage MCPサーバーを起動
2. `search_room_availability` ツールを実行:
   ```json
   {
     "startTime": "2026-01-08T14:30:00+09:00",
     "durationMinutes": 30
   }
   ```
3. 空の `rooms` 配列が返される
4. 同時刻にGoogle Calendar UIで「会議室を追加」すると、利用可能な会議室が表示される

### Environment
- **Version**: sage v1.0.3
- **Platform**: macOS / Linux
- **Configuration**: Google Calendar 認証済み、会議室リソースがGoogle Workspaceに設定済み

## Impact Assessment

### Severity
- [x] High - Major functionality broken

会議室検索機能が全く動作しないため、ユーザーは手動でGoogle Calendar UIを使う必要がある。

### Affected Users
Google Workspaceで会議室リソースを使用しているすべてのユーザー

### Affected Features
- `search_room_availability` ツール
- `check_room_availability` ツール
- `create_calendar_event` の `roomId` パラメータ（会議室が見つからないため指定不可）

## Additional Context

### Error Messages
エラーメッセージは表示されない。正常に処理が完了するが、会議室リストが空。

### Related Issues
なし

## Initial Analysis

### Suspected Root Cause
`src/integrations/google-calendar-room-service.ts` の `fetchRoomResources()` メソッドが **CalendarList API** を使用している。

```typescript
// 現在の実装（L166-189）
const response = await client.calendarList.list({
  maxResults: 250,
  pageToken,
  showHidden: true,
});
```

**問題点**: CalendarList APIはユーザーが**個人的にサブスクライブした**カレンダーのみを返す。会議室リソースはデフォルトではユーザーのカレンダーリストに含まれない。

**必要な対応**: Google Workspaceの会議室リソースを取得するには、以下のいずれかが必要:
1. **Admin SDK Directory API** (`admin.directory.resources.calendars.list`) - 管理者権限が必要
2. **Resources Calendar API** - 組織の会議室リソースを直接取得

### Affected Components
- `src/integrations/google-calendar-room-service.ts`
  - `fetchRoomResources()` メソッド
  - `isRoomCalendar()` メソッド
- 関連するテスト:
  - `tests/unit/google-calendar-room-service.test.ts`
  - `tests/integration/room-availability.test.ts`
