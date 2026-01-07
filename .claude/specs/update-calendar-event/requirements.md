# Requirements Document: update-calendar-event

## Introduction

既存のカレンダーイベントを編集する機能を MCP ツールとして公開する。現在 sage では `create_calendar_event` と `delete_calendar_event` が提供されているが、既存イベントの編集機能がない。これにより、ユーザーは会議室の追加、時間変更、タイトル修正などを sage 経由で行えるようになる。

**重要な発見**: `GoogleCalendarService.updateEvent()` メソッドは既に実装されている。本機能は、このメソッドを MCP ツールとして公開することが主な目的である。

## Alignment with Product Vision

本機能は product.md に記載されている以下の目標を支援する：

- **Calendar Integration**: イベント一覧、作成、削除に加えて「編集」を追加し、カレンダー管理の完全性を実現
- **Room Booking Support**: 既存の会議に会議室を後から追加できるようになり、会議室予約機能の実用性が向上
- **UX改善**: Google Calendar UI に切り替えることなく、sage 内で完結したカレンダー操作が可能に

## Requirements

### Requirement 1: 基本的なイベント編集

**User Story:** エンジニアとして、既存のカレンダーイベントのタイトルや説明を編集したい。会議の目的が変わった際に素早く更新できるようにするため。

#### Acceptance Criteria

1. WHEN `update_calendar_event` ツールが `eventId` と `title` を指定して呼び出された THEN システムは該当イベントのタイトルを更新し成功レスポンスを返す SHALL
2. WHEN `update_calendar_event` ツールが `eventId` と `notes` を指定して呼び出された THEN システムは該当イベントの説明を更新する SHALL
3. IF `eventId` が存在しないイベントを指すTHEN システムは明確なエラーメッセージを返す SHALL

### Requirement 2: 日時の変更

**User Story:** エンジニアとして、会議の開始時刻や終了時刻を変更したい。スケジュール調整が発生した際に対応できるようにするため。

#### Acceptance Criteria

1. WHEN `update_calendar_event` ツールが `startDate` を指定して呼び出された THEN システムは該当イベントの開始時刻を更新する SHALL
2. WHEN `update_calendar_event` ツールが `endDate` を指定して呼び出された THEN システムは該当イベントの終了時刻を更新する SHALL
3. WHEN `startDate` と `endDate` の両方が指定された THEN システムは両方を更新する SHALL
4. IF `startDate` が `endDate` より後の場合 THEN システムはエラーを返す SHALL

### Requirement 3: 会議室の追加・変更・削除

**User Story:** エンジニアとして、既存の会議に会議室を追加または変更したい。会議室を予約し忘れた場合や、別の会議室に変更する必要がある場合に対応できるようにするため。

#### Acceptance Criteria

1. WHEN `update_calendar_event` ツールが `roomId` を指定して呼び出された THEN システムは該当イベントに会議室を追加する SHALL
2. IF イベントに既存の会議室がある AND 新しい `roomId` が指定された THEN システムは既存の会議室を新しい会議室に置き換える SHALL
3. WHEN `removeRoom: true` が指定された THEN システムは該当イベントから会議室を削除する SHALL
4. IF 会議室予約がGoogle Calendar以外のソースで試みられた THEN システムは明確なエラーメッセージを返す SHALL

### Requirement 4: 参加者の管理

**User Story:** エンジニアとして、会議の参加者を追加または削除したい。メンバー変更に対応できるようにするため。

#### Acceptance Criteria

1. WHEN `update_calendar_event` ツールが `attendees` 配列を指定して呼び出された THEN システムは該当イベントの参加者リストを更新する SHALL
2. WHEN 参加者が変更された THEN システムは変更された参加者に通知を送信する SHALL

### Requirement 5: 場所・リマインダーの変更

**User Story:** エンジニアとして、会議の場所やリマインダー設定を変更したい。柔軟なカレンダー管理ができるようにするため。

#### Acceptance Criteria

1. WHEN `update_calendar_event` ツールが `location` を指定して呼び出された THEN システムは該当イベントの場所を更新する SHALL
2. WHEN `update_calendar_event` ツールが `alarms` 配列を指定して呼び出された THEN システムは該当イベントのリマインダーを更新する SHALL

### Requirement 6: イベントタイプ固有の制限

**User Story:** エンジニアとして、イベントタイプに応じた適切な編集制限を受けたい。不正な操作によるデータ破損を防ぐため。

#### Acceptance Criteria

1. IF イベントタイプが `birthday` の場合 AND タイトル、リマインダー、日時以外のフィールドが変更された THEN システムはエラーを返す SHALL
2. IF イベントタイプが `fromGmail` の場合 THEN システムはリマインダーと参加者のみ編集可能とする SHALL
3. IF イベントタイプが `outOfOffice` または `focusTime` の場合 THEN システムは `autoDeclineMode`、`declineMessage`、`chatStatus` の変更を許可する SHALL

### Requirement 7: マルチソース対応

**User Story:** エンジニアとして、Google Calendar と EventKit の両方のイベントを編集したい。使用しているカレンダーソースに関係なく機能を利用できるようにするため。

#### Acceptance Criteria

1. WHEN `source` パラメータが指定されない場合 THEN システムは `eventId` から適切なソースを判定する SHALL
2. IF `source: 'google'` が指定された場合 THEN システムは Google Calendar API を使用して更新する SHALL
3. IF `source: 'eventkit'` が指定された場合 AND macOS で実行されている THEN システムは EventKit を使用して更新する SHALL
4. IF EventKit で高度な機能（会議室、イベントタイプ固有プロパティ）が要求された THEN システムは Google Calendar へのフォールバックを提案する SHALL

### Requirement 8: Stdio/Remote 両モード対応

**User Story:** エンジニアとして、ローカル（stdio）モードとリモート（HTTP）モードの両方で同じ機能を使いたい。環境に関係なく一貫した体験を得るため。

#### Acceptance Criteria

1. WHEN stdio モードで `update_calendar_event` が呼び出された THEN システムは正しく動作する SHALL
2. WHEN remote モードで `update_calendar_event` が呼び出された THEN システムは正しく動作する SHALL
3. WHEN 新しいツールが追加された THEN `src/index.ts` と `src/cli/mcp-handler.ts` の両方に追加される SHALL

## Non-Functional Requirements

### Performance
- イベント更新は 3 秒以内に完了すること
- Google Calendar API のレート制限を遵守すること（リトライ付き）

### Security
- OAuth トークンの安全な取り扱いを継続すること
- ユーザーが所有または編集権限を持つイベントのみ更新可能とすること

### Reliability
- ネットワークエラー時は指数バックオフでリトライすること
- 部分的な更新失敗時は明確なエラーメッセージを提供すること
- 404エラー（イベント削除済み）は適切にハンドリングすること

### Usability
- エラーメッセージは日本語で、次のアクションを示すこと
- 更新成功時は変更内容のサマリーを返すこと
- パラメータは `create_calendar_event` と一貫性を持たせること
