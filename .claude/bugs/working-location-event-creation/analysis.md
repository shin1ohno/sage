# Bug Analysis

## Root Cause Analysis

### Investigation Summary

Google Calendar API の公式ドキュメントを調査し、`workingLocation` イベント作成時に必要なプロパティを確認した。

**参照元**:
- Google Calendar API Events Resource: https://developers.google.com/calendar/api/v3/reference/events
- Working location documentation

### Root Cause

`workingLocation` イベントの作成には以下の2つのプロパティが必須だが、現在の実装では設定されていない：

1. **`visibility: 'public'`** - Working Location イベントは公開イベントである必要がある
2. **`transparency: 'transparent'`** - Working Location イベントは「予定なし」として表示される必要がある

### Contributing Factors

- OOO/Focus Time イベントの実装時に `transparency: 'opaque'` を追加したが、Working Location には異なる要件があることを見落としていた
- Google Calendar API のエラーメッセージは `transparency` のみを指摘し、`visibility` については言及しなかった

## Technical Details

### Affected Code Locations

**`src/integrations/google-calendar-service.ts`** - `buildEventTypePayload()` メソッド (lines 310-337)

```typescript
case 'workingLocation':
  if (request.workingLocationProperties) {
    // ... builds workingLocationProperties
    // MISSING: payload.visibility = 'public';
    // MISSING: payload.transparency = 'transparent';
    payload.workingLocationProperties = workingLocationPayload;
  }
  break;
```

### Data Flow Analysis

1. MCP ツール `create_calendar_event` が呼び出される
2. `handleCreateCalendarEvent()` でリクエストを処理
3. `GoogleCalendarService.createEvent()` が呼び出される
4. `buildEventTypePayload()` で `workingLocationProperties` は設定されるが、`visibility`/`transparency` が欠落
5. Google Calendar API がエラーを返す

### Dependencies

- `googleapis` パッケージ (Google Calendar API v3)
- Zod validation schemas

## Impact Analysis

### Direct Impact

- `create_calendar_event` で `eventType: 'workingLocation'` を指定すると必ず失敗する
- ユーザーは Working Location イベントを sage から作成できない

### Indirect Impact

- Google Calendar の Working Location 機能を活用したワークフローが機能しない
- ハイブリッドワーク管理の自動化が不可能

### Risk Assessment

- **Severity**: Medium
- **Affected Users**: Working Location を使用するすべてのユーザー
- **Workaround**: Google Calendar Web UI から手動で作成

## Related API Compliance Issues (追加調査結果)

調査中に発見した他の API 要件の不一致：

### 1. Focus Time / OOO の all-day イベント制限

**問題**: Google Calendar API は Focus Time と OOO イベントで `isAllDay: true` を許可しない
**現在の実装**: バリデーションなし（`validation.ts` には存在しない）
**影響**: all-day の Focus Time/OOO を作成しようとすると API エラー

### 2. Status イベントの attendees 制限

**問題**: `focusTime`, `outOfOffice`, `workingLocation` イベントには attendees を追加できない
**現在の実装**: バリデーションなし
**影響**: attendees を指定すると API エラー

### 3. Status イベントのカレンダー制限

**問題**: Status イベント (focusTime, outOfOffice, workingLocation) は primary calendar でのみ作成可能
**現在の実装**: カレンダー指定のバリデーションなし
**影響**: 他のカレンダーに作成しようとすると API エラー

## Solution Approach

### Fix Strategy

#### Phase 1: Working Location 即時修正

`buildEventTypePayload()` の `workingLocation` case に以下を追加：

```typescript
case 'workingLocation':
  // Google Calendar API requires visibility: 'public' and transparency: 'transparent'
  payload.visibility = 'public';
  payload.transparency = 'transparent';
  // ... existing workingLocationProperties code
```

#### Phase 2: 追加バリデーション (推奨)

`validation.ts` に以下の refine を追加：

1. **Focus Time / OOO の all-day 禁止**:
```typescript
.refine(
  (data) => {
    const eventType = data.eventType || 'default';
    if (eventType === 'focusTime' || eventType === 'outOfOffice') {
      return data.isAllDay !== true;
    }
    return true;
  },
  {
    message: 'Focus Time and Out of Office events cannot be all-day events.',
    path: ['isAllDay'],
  }
)
```

2. **Status イベントの attendees 禁止**: 現在 attendees パラメータは MCP ツールに存在しないため、将来追加時に考慮

### Alternative Solutions

1. **API エラーをそのまま返す**: バリデーションを追加せず、API エラーメッセージに依存
   - Pros: 実装が最小限
   - Cons: エラーメッセージが分かりにくい

2. **包括的なバリデーション**: すべての API 要件を Zod で事前チェック
   - Pros: ユーザーフレンドリーなエラー
   - Cons: 実装工数が大きい、API 仕様変更時の追従が必要

### Risks and Trade-offs

- 修正は最小限で、既存の動作に影響しない
- Phase 2 は別 issue として切り出し可能

## Implementation Plan

### Changes Required

1. **`src/integrations/google-calendar-service.ts`**:
   - `buildEventTypePayload()` の `workingLocation` case に `visibility` と `transparency` を追加

2. **`src/config/validation.ts`** (Phase 2):
   - Focus Time / OOO の all-day 制限を追加

### Testing Strategy

1. **Manual Testing**:
   - `create_calendar_event` で `eventType: 'workingLocation'` を実行
   - イベントが Google Calendar に作成されることを確認

2. **Automated Testing**:
   - 既存テストが引き続き pass することを確認
   - `npm run build` が成功することを確認

### Rollback Plan

- コード変更は `buildEventTypePayload()` 内の2行追加のみ
- 問題発生時は該当行を削除してロールバック可能

---
**Status**: Analysis Complete
**Last Updated**: 2026-01-06
