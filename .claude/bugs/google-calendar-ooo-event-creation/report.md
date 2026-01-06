# Bug Report

## Bug Summary
`create_calendar_event` ツールでGoogle CalendarのOOO（Out of Office）やFocus Timeなどの特殊イベントタイプを作成できない。

## Bug Details

### Expected Behavior
`create_calendar_event` ツールで `eventType` パラメータを指定し、以下のイベントタイプを作成できるべき：
- `outOfOffice` - 休暇・不在イベント（自動辞退機能付き）
- `focusTime` - 集中時間イベント（チャットステータス設定付き）
- `workingLocation` - 勤務場所イベント

### Actual Behavior
`create_calendar_event` ツールには `eventType` パラメータが存在せず、常に `default` タイプのイベントしか作成できない。

### Steps to Reproduce
1. Claude Codeでsageの `create_calendar_event` ツールを呼び出す
2. パラメータを確認 → `eventType` が存在しない
3. OOOイベントを作成しようとしても方法がない

### Environment
- **Version**: sage v0.12.2
- **Platform**: 全プラットフォーム（macOS, Linux, Windows）
- **Calendar Source**: Google Calendar

## Impact Assessment

### Severity
- [x] Medium - Feature impaired but workaround exists

### Affected Users
- Google Calendarで休暇予定を登録したいユーザー
- Focus Time（集中時間）を設定したいユーザー
- Working Location（勤務場所）を記録したいユーザー

### Affected Features
- `create_calendar_event` MCP ツール
- Google Calendar イベント作成機能

## Additional Context

### Error Messages
エラーは発生しない。単にパラメータが存在しないため、機能が利用できない。

### Related Files
型定義は既に存在する：
- `src/types/google-calendar-types.ts`: `GoogleCalendarEventType`, `OutOfOfficeProperties`, `FocusTimeProperties` など
- `src/index.ts:496-534`: `create_calendar_event` ツール定義（eventType パラメータなし）
- `src/tools/calendar/handlers.ts`: `handleCreateCalendarEvent` ハンドラー
- `src/integrations/google-calendar-service.ts`: Google Calendar API呼び出し

### Related Issues
- 型定義は Requirement 1-6 として既に実装済み
- イベント取得時には `eventType` が正しく返される
- イベント作成時のみ `eventType` 指定ができない

## Initial Analysis

### Suspected Root Cause
`create_calendar_event` ツール定義時に `eventType` パラメータとその関連プロパティ（`outOfOfficeProperties`, `focusTimeProperties` など）が追加されていない。

### Affected Components
1. `src/index.ts` - ツール定義（パラメータ追加が必要）
2. `src/tools/calendar/handlers.ts` - ハンドラー（eventType処理追加が必要）
3. `src/integrations/google-calendar-service.ts` - API呼び出し（eventType付きでAPIを呼ぶ必要）
4. `src/integrations/calendar-source-manager.ts` - ソースマネージャー（eventType転送が必要）

---
**Created**: 2026-01-06
**Status**: Reported
