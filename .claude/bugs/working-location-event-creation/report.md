# Bug Report

## Bug Summary
`create_calendar_event` で `eventType: workingLocation` を指定すると、Google Calendar API が `transparency: transparent` を要求してエラーになる。

## Bug Details

### Expected Behavior
Working Location イベントを `create_calendar_event` ツールで作成できる。

### Actual Behavior
エラーが発生する：
```
Failed to create event in Google Calendar: Failed after 3 attempts:
A working location event must have a transparency setting of transparent.
```

### Steps to Reproduce
1. sage MCP の `create_calendar_event` を呼び出す
2. 以下のパラメータを指定:
   ```json
   {
     "title": "Office",
     "startDate": "2026-01-09",
     "endDate": "2026-01-10",
     "eventType": "workingLocation",
     "workingLocationType": "officeLocation"
   }
   ```
3. エラー発生

### Environment
- **Version**: sage v1.0.1
- **Platform**: 全プラットフォーム
- **Calendar Source**: Google Calendar

## Impact Assessment

### Severity
- [x] Medium - Feature impaired but workaround exists

### Affected Users
- Working Location を sage から設定したいユーザー

### Affected Features
- `create_calendar_event` MCP ツール（workingLocation タイプ）

## Additional Context

### Error Messages
```
Failed to create event in all sources. Errors:
google: Failed to create event in Google Calendar: Failed after 3 attempts:
A working location event must have a transparency setting of transparent.;
eventkit: EventKit does not support event creation in current implementation
```

### Related Files
- `src/integrations/google-calendar-service.ts` - Google Calendar API 呼び出し
- `src/tools/calendar/handlers.ts` - イベント作成ハンドラー

### Related Issues
- OOO/Focus Time イベントは正常に作成可能
- Working Location イベントのみ失敗

## Initial Analysis

### Suspected Root Cause
Google Calendar API の Working Location イベントには `transparency: 'transparent'` が必須だが、現在の実装では設定していない。

### Affected Components
- `src/integrations/google-calendar-service.ts` - `buildEventTypePayload` または `createEvent` メソッド

---
**Created**: 2026-01-06
**Status**: Reported
