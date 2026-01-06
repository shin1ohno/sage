# Bug Analysis

## Root Cause Analysis

### Investigation Summary

MCP ツールを使った実際のテストで問題を再現し、コードを詳細に調査しました。

**テスト結果**:
| API | イベント ID | 結果 |
|-----|-----------|------|
| `respond_to_calendar_event` (単一) | `2iiij0j6to1h5n9t9jo0rt5uq5_20260106T041500Z` | ✅ 成功 |
| `respond_to_calendar_events_batch` (バッチ) | `6ldd9sp02d95l5d6dm72tdu4nj`, `7cs3kh9iq8ak3e8uap3ir3cht8` | ❌ 「出席者なし」でスキップ |

同じ招待されたイベントでも、使用する API によって結果が異なることを確認しました。

### Root Cause

**単一イベント API とバッチ API で異なるコードパスを使用している設計上の不整合**

| API | ハンドラー | 使用サービス | Google Calendar 対応 |
|-----|----------|------------|---------------------|
| `respond_to_calendar_event` | `handleRespondToCalendarEvent` | `CalendarSourceManager.respondToEvent()` | ✅ 対応 |
| `respond_to_calendar_events_batch` | `handleRespondToCalendarEventsBatch` | `CalendarEventResponseService.respondToEventsBatch()` | ❌ EventKit のみ |

### Contributing Factors

1. **EventKit と Google Calendar のイベント ID 形式の違い**
   - EventKit: `218F62EC-7F99-49A0-8344-1C75CB06F13D:xxxx@google.com`
   - Google Calendar: `6ldd9sp02d95l5d6dm72tdu4nj`
   - EventKit の AppleScript は Google Calendar 形式の ID でイベントを見つけられない

2. **エラーハンドリングの問題** (`calendar-event-response.ts:411-418`)
   ```typescript
   // エラー時に hasAttendees: false を返してしまう
   return {
     id: eventId,
     title: 'Unknown Event',
     isOrganizer: false,
     hasAttendees: false,  // ← これが「出席者なし」の原因
     isReadOnly: true,
     calendarType: 'local',
   };
   ```

3. **バッチ API 実装時に Google Calendar 対応が考慮されなかった**

## Technical Details

### Affected Code Locations

1. **`src/tools/calendar/handlers.ts:515-569`** - バッチハンドラー
   - **問題**: `CalendarEventResponseService` を直接使用
   - **修正対象**: `CalendarSourceManager` を使用するように変更

   ```typescript
   // 現在のコード (515-569行目)
   const result = await calendarEventResponseService!.respondToEventsBatch({
     eventIds,
     response,
     comment,
   });
   ```

2. **`src/tools/calendar/handlers.ts:402-507`** - 単一イベントハンドラー（参考）
   - **正しい実装**: `CalendarSourceManager.respondToEvent()` を使用

   ```typescript
   // 正しいコード (430-435行目)
   const result = await calendarSourceManager!.respondToEvent(
     eventId,
     response,
     source === 'google' ? 'google' : undefined,
     calendarId
   );
   ```

3. **`src/integrations/calendar-source-manager.ts:1164-1246`** - respondToEvent
   - Google Calendar API を適切に使用
   - **既存の正しい実装**: バッチ API もこれを活用すべき

4. **`src/integrations/calendar-event-response.ts:386-419`** - fetchEventDetails
   - EventKit のみ対応、Google Calendar ID でエラーになる

### Data Flow Analysis

**単一イベント API（正常動作）**:
```
handleRespondToCalendarEvent
  → CalendarSourceManager.respondToEvent()
  → GoogleCalendarService.respondToEvent()
  → Google Calendar API (PATCH)
  → ✅ 成功
```

**バッチ API（バグあり）**:
```
handleRespondToCalendarEventsBatch
  → CalendarEventResponseService.respondToEventsBatch()
  → CalendarEventResponseService.respondToEvent()
  → CalendarEventResponseService.fetchEventDetails()  // EventKit AppleScript
  → イベントが見つからない
  → hasAttendees: false を返す
  → canRespondToEvent() で「出席者なし」と判定
  → ❌ スキップ
```

### Dependencies

- `CalendarSourceManager` - Google Calendar 対応あり
- `GoogleCalendarService` - Google Calendar API ラッパー
- `CalendarEventResponseService` - EventKit のみ対応（macOS 専用）

## Impact Analysis

### Direct Impact

- **バッチイベント返答機能が完全に動作しない**
- Google Calendar のイベントに対してバッチ返答ができない
- ユーザーは単一 API を複数回呼び出す必要がある

### Indirect Impact

- 休暇期間中のイベント一括辞退ができない
- ワークフローの効率が低下
- ユーザー体験の悪化

### Risk Assessment

- **重大度**: High
- **影響範囲**: 全ての Google Calendar ユーザー
- **回避策**: 単一 API を複数回使用（非効率だが動作する）

## Solution Approach

### Fix Strategy

**バッチ API を単一 API と同じコードパスを使用するように変更**

`handleRespondToCalendarEventsBatch` を以下のように修正:

1. `CalendarSourceManager` を取得（既存の単一 API と同様）
2. 各イベント ID に対して `CalendarSourceManager.respondToEvent()` を呼び出す
3. 結果を集約してバッチレスポンスを生成

### Alternative Solutions

| 案 | 説明 | 評価 |
|----|------|------|
| **A: handlers.ts の修正** | バッチハンドラーを CalendarSourceManager 経由に変更 | ✅ **推奨**: 最小限の変更で最大の効果 |
| B: CalendarSourceManager に respondToEventsBatch 追加 | 新しいメソッドを追加 | △ オーバーエンジニアリング |
| C: CalendarEventResponseService に Google Calendar 対応追加 | AppleScript 以外の実装を追加 | ✗ 設計上不適切 |

### Risks and Trade-offs

**選択した方針 (A) のリスク**:
- 低リスク: 既存の `respondToEvent` メソッドを再利用
- バッチ処理が順次処理になる（並列化は今後の改善点）
- 既存テストへの影響は最小限

## Implementation Plan

### Changes Required

**1. `src/tools/calendar/handlers.ts` の修正**

```diff
 export async function handleRespondToCalendarEventsBatch(
   ctx: CalendarToolsContext,
   args: RespondToCalendarEventsBatchInput
 ) {
   const { eventIds, response, comment } = args;
   const config = ctx.getConfig();

   if (!config) {
     return createToolResponse({
       error: true,
       message: 'sageが設定されていません。check_setup_statusを実行してください。',
     });
   }

-  let calendarEventResponseService = ctx.getCalendarEventResponseService();
-  if (!calendarEventResponseService) {
+  let calendarSourceManager = ctx.getCalendarSourceManager();
+  if (!calendarSourceManager) {
     ctx.initializeServices(config);
-    calendarEventResponseService = ctx.getCalendarEventResponseService();
+    calendarSourceManager = ctx.getCalendarSourceManager();
   }

   try {
-    const isAvailable =
-      await calendarEventResponseService!.isEventKitAvailable();
-
-    if (!isAvailable) {
-      return createToolResponse({
-        success: false,
-        message: 'カレンダーイベント返信機能はmacOSでのみ利用可能です。',
-      });
-    }
-
-    const result = await calendarEventResponseService!.respondToEventsBatch({
-      eventIds,
-      response,
-      comment,
-    });
+    // 各イベントに対して CalendarSourceManager.respondToEvent を呼び出す
+    const results = {
+      succeeded: [] as Array<{ id: string; title: string; reason: string }>,
+      skipped: [] as Array<{ id: string; title: string; reason: string }>,
+      failed: [] as Array<{ id: string; title: string; error: string }>,
+    };
+
+    for (const eventId of eventIds) {
+      try {
+        const result = await calendarSourceManager!.respondToEvent(
+          eventId,
+          response,
+          undefined,  // source: 自動検出
+          undefined   // calendarId: 自動検出
+        );
+
+        if (result.success) {
+          results.succeeded.push({
+            id: eventId,
+            title: eventId,  // イベントタイトルは取得できない
+            reason: result.message,
+          });
+        } else {
+          results.failed.push({
+            id: eventId,
+            title: eventId,
+            error: result.message,
+          });
+        }
+      } catch (error) {
+        results.failed.push({
+          id: eventId,
+          title: eventId,
+          error: error instanceof Error ? error.message : 'Unknown error',
+        });
+      }
+    }
+
+    const total = eventIds.length;
+    const succeeded = results.succeeded.length;
+    const skipped = results.skipped.length;
+    const failed = results.failed.length;

     return createToolResponse({
-      success: result.success,
-      summary: result.summary,
+      success: failed === 0,
+      summary: { total, succeeded, skipped, failed },
       details: {
-        succeeded: result.details.succeeded,
-        skipped: result.details.skipped,
-        failed: result.details.failed,
+        succeeded: results.succeeded,
+        skipped: results.skipped,
+        failed: results.failed,
       },
-      message: result.message,
+      message: generateBatchMessage(total, succeeded, skipped, failed, response),
     });
   } catch (error) {
     return createErrorFromCatch(
       'カレンダーイベント一括返信に失敗しました',
       error
     );
   }
 }
```

### Testing Strategy

1. **単体テスト**: `handleRespondToCalendarEventsBatch` の新実装をテスト
2. **統合テスト**: MCP ツールを通じた E2E テスト
3. **手動テスト**: 実際の Google Calendar イベントでバッチ返答を確認

**テストケース**:
- Google Calendar イベント複数への一括返答
- EventKit イベントと Google Calendar イベントの混在
- 存在しないイベント ID を含むバッチ

### Rollback Plan

1. `src/tools/calendar/handlers.ts` の変更を git revert
2. 既存のテストが全て pass することを確認
3. 影響は handlers.ts のみに限定されるため、ロールバックは容易
