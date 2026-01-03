# Calendar Specifications

カレンダー機能に関する仕様。EventKitとGoogle Calendarの統合を定義します。

## Directory Structure

```
calendar/
├── README.md           # This file
├── components.md       # Calendar components (CalendarService, GoogleCalendarService, etc.)
└── google-calendar/    # Google Calendar API integration
    ├── requirements.md # 11 requirements for Google Calendar
    ├── design.md       # Google Calendar design
    └── tasks.md        # 43 implementation tasks
```

## Components

| Component | Description | Source |
|-----------|-------------|--------|
| CalendarService | EventKit統合、空き時間検出 | `src/integrations/calendar-service.ts` |
| GoogleCalendarService | Google Calendar API統合 | `src/integrations/google-calendar-service.ts` |
| CalendarSourceManager | マルチソース管理、フォールバック | `src/integrations/calendar-source-manager.ts` |

## Features

- **EventKit Integration**: macOS Calendar.app統合
- **Google Calendar Integration**: Google Calendar API v3統合
- **Multi-Source Support**: 複数ソースのイベント集約・重複排除
- **Automatic Fallback**: エラー時の自動フォールバック

## Related Requirements

ルートの `requirements.md` から:
- 要件6: カレンダー統合
- 要件16: カレンダーイベント一覧取得
- 要件17: カレンダーイベントへの返信
- 要件18: カレンダーイベントの作成
- 要件19: カレンダーイベントの削除

## See Also

- [Google Calendar Integration](./google-calendar/README.md)
- [Shared Architecture](../shared/architecture.md)
