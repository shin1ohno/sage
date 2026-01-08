# Bug Analysis

## Root Cause Analysis

### Investigation Summary

Google Calendar APIの`events.list`メソッドの日付パラメータ仕様を調査した結果、`timeMax`が**排他的（exclusive）**であることを考慮していない実装バグを特定しました。

### Root Cause

`normalizeToRFC3339()`メソッドが`startDate`と`endDate`を同じ方法で処理しているため、`endDate`で指定した日付のイベントが取得されない。

**Google Calendar API仕様:**
- `timeMin`: **Inclusive** - この時刻以降のイベントを取得
- `timeMax`: **Exclusive** - この時刻**より前**のイベントを取得

**現在の実装の問題:**
```
入力: startDate: "2026-01-09", endDate: "2026-01-09"

変換後:
  timeMin: "2026-01-09T00:00:00Z" (2026-01-09 00:00:00以降)
  timeMax: "2026-01-09T00:00:00Z" (2026-01-09 00:00:00より前)

結果: 範囲が0 → イベント0件
```

### Contributing Factors

1. **テストの不備**: 既存テストは異なる日付（2026-01-15, 2026-01-16）を使用しており、同一日付のケースをテストしていなかった
2. **コメントの誤解**: コード内のコメント「Using 00:00:00 UTC ensures we capture all events on the date」は`startDate`には正しいが、`endDate`には当てはまらない
3. **API仕様の見落とし**: Google Calendar APIの`timeMax`の排他性が考慮されていなかった

## Technical Details

### Affected Code Locations

- **File**: `src/integrations/google-calendar-service.ts`
  - **Function/Method**: `normalizeToRFC3339()`
  - **Lines**: `474-483`
  - **Issue**: `endDate`に対しても同じ変換を適用している

- **File**: `src/integrations/google-calendar-service.ts`
  - **Function/Method**: `listEvents()`
  - **Lines**: `516-517`
  - **Issue**: `timeMax`に`normalizeToRFC3339(request.endDate)`をそのまま渡している

### Data Flow Analysis

```
list_calendar_events ツール呼び出し
  ↓
handleListCalendarEvents() [handlers.ts]
  ↓
CalendarSourceManager.getEvents() [calendar-source-manager.ts]
  ↓
GoogleCalendarService.listEvents() [google-calendar-service.ts]
  ↓
normalizeToRFC3339(request.endDate) ← ここで問題発生
  ↓
Google Calendar API (events.list)
  ↓
timeMax が排他的のため、endDate当日のイベントが除外される
```

### Dependencies

- `googleapis` (Google Calendar API client)
- Google Calendar API v3

## Impact Analysis

### Direct Impact

- `list_calendar_events`: 指定した`endDate`当日のイベントが取得できない
- 同一日付を指定した場合（例: 今日の予定）: イベントが0件返される

### Indirect Impact

- `find_available_slots`: 空き時間検索で誤った結果が返される可能性
- `find_common_availability`: 参加者の空き時間検出に影響
- `search_room_availability`: 会議室の空き状況検出に影響

### Risk Assessment

- **重要度**: High
- **影響範囲**: Google Calendar統合を使用する全ての機能
- **回避策**: `endDate`に翌日の日付を手動で指定する（ユーザーフレンドリーではない）

## Solution Approach

### Fix Strategy

`normalizeToRFC3339()`メソッドに`isEndDate`パラメータを追加し、`endDate`の場合は翌日の00:00:00に変換する。

```typescript
private normalizeToRFC3339(dateString: string, isEndDate: boolean = false): string {
  // Already in RFC3339 format
  if (dateString.includes('T')) {
    return dateString;
  }

  if (isEndDate) {
    // For endDate: add 1 day to make timeMax exclusive work correctly
    const date = new Date(dateString + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().replace('.000Z', 'Z');
  }

  return `${dateString}T00:00:00Z`;
}
```

### Alternative Solutions

1. **専用メソッドを作成**: `normalizeStartDateToRFC3339()` と `normalizeEndDateToRFC3339()` を別々に作成
   - メリット: 明確な責任分離
   - デメリット: コード重複

2. **API呼び出し時に加算**: `listEvents()`内で`endDate`に直接1日加算
   - メリット: 既存メソッドを変更しない
   - デメリット: ロジックが分散する

**選択**: オプション1（パラメータ追加）が最もクリーンで影響範囲が限定的

### Risks and Trade-offs

- **リスク**: 既にRFC3339形式で渡された`endDate`（例: `2026-01-09T23:59:59Z`）は変換されないため、期待通りに動作する
- **トレードオフ**: 既存の呼び出し元コードの変更が必要だが、影響範囲は`listEvents()`メソッド内のみ

## Implementation Plan

### Changes Required

1. **Change 1**: `normalizeToRFC3339()` メソッドの修正
   - File: `src/integrations/google-calendar-service.ts`
   - Modification: `isEndDate`パラメータを追加し、`true`の場合は翌日に加算

2. **Change 2**: `listEvents()` メソッドの修正
   - File: `src/integrations/google-calendar-service.ts`
   - Modification: `timeMax`の引数に`isEndDate: true`を渡す

3. **Change 3**: テストの追加
   - File: `tests/unit/google-calendar-service.test.ts`
   - Modification: 同一日付のケースと、endDateが正しく翌日に変換されることを検証するテストを追加

### Testing Strategy

1. **Unit Test**:
   - 同一日付（`startDate == endDate`）でイベントが取得できることを確認
   - `endDate`が翌日の00:00:00Zに正規化されることを確認
   - RFC3339形式の`endDate`はそのまま渡されることを確認

2. **Integration Test**:
   - 実際のGoogle Calendar APIで今日の予定が取得できることを確認

### Rollback Plan

変更はローカルの`normalizeToRFC3339()`メソッドのみに限定されるため、問題が発生した場合は該当コミットをrevertするだけで復旧可能。
