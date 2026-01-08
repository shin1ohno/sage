# Bug Report

## Bug Summary

Google Calendar APIからイベントを取得する際、`endDate`で指定した日付のイベントが取得されない。`timeMax`パラメータが排他的（exclusive）であることを考慮していないため、日付範囲の終端日のイベントが全て欠落する。

## Bug Details

### Expected Behavior

`list_calendar_events`で`startDate: "2026-01-09"`, `endDate: "2026-01-09"`を指定した場合、2026年1月9日の全てのイベントが取得されるべき。

### Actual Behavior

イベントが0件返される。`timeMin`と`timeMax`が両方とも`2026-01-09T00:00:00Z`になるため、範囲が0となりイベントが取得できない。

### Steps to Reproduce

1. sageの`list_calendar_events`ツールを呼び出す
2. `startDate: "2026-01-09"`, `endDate: "2026-01-09"`を指定
3. Google Calendarに2026-01-09のイベントが存在していても、0件が返される

### Environment

- **Version**: sage 0.1.0
- **Platform**: macOS（Darwin）、Node.js
- **Configuration**: Google Calendar統合が有効

## Impact Assessment

### Severity

- [ ] Critical - System unusable
- [x] High - Major functionality broken
- [ ] Medium - Feature impaired but workaround exists
- [ ] Low - Minor issue or cosmetic

### Affected Users

Google Calendar統合を使用している全てのユーザー

### Affected Features

- `list_calendar_events` ツール
- `find_available_slots` ツール（内部でイベント取得を使用）
- カレンダーベースの空き時間検出機能

## Additional Context

### Error Messages

エラーメッセージは出力されない。正常に0件のイベントが返されるため、無音で失敗する。

```json
{
  "success": true,
  "sources": ["eventkit", "google"],
  "events": [],
  "totalEvents": 0,
  "message": "指定した期間にイベントが見つかりませんでした。"
}
```

### Screenshots/Media

N/A

### Related Issues

N/A

## Initial Analysis

### Suspected Root Cause

`src/integrations/google-calendar-service.ts`の`normalizeToRFC3339()`メソッド（474-483行目）が、Google Calendar APIの仕様を正しく考慮していない。

**Google Calendar APIの仕様:**
- `timeMin`: **Inclusive**（その時刻以降を取得）
- `timeMax`: **Exclusive**（その時刻より前を取得）

**現在の実装:**
```typescript
private normalizeToRFC3339(dateString: string): string {
  if (dateString.includes('T')) {
    return dateString;
  }
  return `${dateString}T00:00:00Z`;  // endDateでも同じ処理
}
```

**問題:**
- `endDate: "2026-01-09"` → `timeMax: "2026-01-09T00:00:00Z"`
- この場合、2026-01-09 00:00:00より前のイベントのみ取得される
- 結果として、2026-01-09のイベントは全て除外される

### Affected Components

- `src/integrations/google-calendar-service.ts`
  - `normalizeToRFC3339()` メソッド（474-483行目）
  - `listEvents()` メソッド（516-517行目のAPI呼び出し）
- `tests/unit/google-calendar-service.test.ts`
  - 既存テストがこのバグを検出できていない
