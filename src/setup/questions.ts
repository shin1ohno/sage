/**
 * Setup Wizard Questions
 * Defines the questions asked during initial setup
 */

export interface Question {
  id: string;
  text: string;
  type: 'text' | 'select' | 'multiselect' | 'time' | 'days';
  options?: string[];
  defaultValue?: string | string[];
  helpText?: string;
  essential: boolean;
}

export const WIZARD_QUESTIONS: Question[] = [
  // Essential questions (used in quick mode)
  {
    id: 'user_name',
    text: 'お名前を教えてください',
    type: 'text',
    helpText: 'sageがあなたを呼ぶ際に使用します',
    essential: true,
  },
  {
    id: 'timezone',
    text: 'タイムゾーンを選択してください',
    type: 'select',
    options: ['Asia/Tokyo', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'UTC'],
    defaultValue: 'Asia/Tokyo',
    helpText: 'スケジュールとリマインドの時刻に使用されます',
    essential: true,
  },
  {
    id: 'work_start',
    text: '勤務開始時刻を教えてください（HH:MM形式）',
    type: 'time',
    defaultValue: '09:00',
    helpText: '空き時間の検索に使用されます',
    essential: true,
  },
  {
    id: 'work_end',
    text: '勤務終了時刻を教えてください（HH:MM形式）',
    type: 'time',
    defaultValue: '18:00',
    helpText: '空き時間の検索に使用されます',
    essential: true,
  },
  {
    id: 'apple_reminders_enabled',
    text: 'Apple Remindersを使用しますか？',
    type: 'select',
    options: ['yes', 'no'],
    defaultValue: 'yes',
    helpText: '7日以内の短期タスクのリマインドに使用されます',
    essential: true,
  },

  // Additional questions (used in full mode)
  {
    id: 'user_email',
    text: 'メールアドレスを教えてください（任意）',
    type: 'text',
    helpText: 'カレンダー統合に使用される場合があります',
    essential: false,
  },
  {
    id: 'user_role',
    text: 'あなたの役職を教えてください（任意）',
    type: 'text',
    helpText: 'タスク分析のパーソナライズに使用されます',
    essential: false,
  },
  {
    id: 'manager_name',
    text: 'マネージャーの名前を教えてください（任意）',
    type: 'text',
    helpText: 'マネージャーからのタスクの優先度を高く設定します',
    essential: false,
  },
  {
    id: 'meeting_days',
    text: '会議が多い曜日を選択してください',
    type: 'days',
    options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    defaultValue: ['Tuesday', 'Thursday'],
    helpText: 'これらの日は深い作業よりも会議に適していると判断されます',
    essential: false,
  },
  {
    id: 'deep_work_days',
    text: '集中作業（ディープワーク）に適した曜日を選択してください',
    type: 'days',
    options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    defaultValue: ['Monday', 'Wednesday', 'Friday'],
    helpText: 'これらの日は複雑なタスクのスケジュールに優先されます',
    essential: false,
  },
  {
    id: 'apple_reminders_list',
    text: 'Apple Remindersで使用するリスト名を教えてください',
    type: 'text',
    defaultValue: 'Reminders',
    helpText: 'リマインダーが作成されるリストの名前',
    essential: false,
  },
  {
    id: 'notion_enabled',
    text: 'Notionを使用しますか？',
    type: 'select',
    options: ['yes', 'no'],
    defaultValue: 'no',
    helpText: '8日以上先の長期タスクの管理に使用されます',
    essential: false,
  },
  {
    id: 'notion_database_id',
    text: 'NotionデータベースIDを教えてください（任意）',
    type: 'text',
    helpText: 'Notion統合を使用する場合に必要です',
    essential: false,
  },
  {
    id: 'google_calendar_enabled',
    text: 'Google Calendarを使用しますか？',
    type: 'select',
    options: ['yes', 'no'],
    defaultValue: 'no',
    helpText: 'カレンダーから空き時間を検出するために使用されます',
    essential: false,
  },
  {
    id: 'language',
    text: '使用する言語を選択してください',
    type: 'select',
    options: ['ja', 'en'],
    defaultValue: 'ja',
    helpText: 'メッセージやレスポンスの言語',
    essential: false,
  },
];
