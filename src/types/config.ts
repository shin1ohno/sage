/**
 * Configuration type definitions
 */

import type { Priority } from './task.js';

export interface UserConfig {
  version: string;
  createdAt: string;
  lastUpdated: string;
  user: UserProfile;
  calendar: CalendarConfig;
  priorityRules: PriorityRules;
  estimation: EstimationConfig;
  reminders: RemindersConfig;
  team: TeamConfig;
  integrations: IntegrationsConfig;
  preferences: PreferencesConfig;
}

export interface UserProfile {
  name: string;
  email?: string;
  timezone: string;
  role?: string;
}

export interface CalendarConfig {
  workingHours: {
    start: string;
    end: string;
  };
  meetingHeavyDays: string[];
  deepWorkDays: string[];
  deepWorkBlocks: DeepWorkBlock[];
  timeZone: string;
}

export interface DeepWorkBlock {
  day: string;
  startHour: number;
  endHour: number;
  description: string;
}

export interface PriorityRules {
  p0Conditions: PriorityCondition[];
  p1Conditions: PriorityCondition[];
  p2Conditions: PriorityCondition[];
  defaultPriority: Priority;
}

export interface PriorityCondition {
  type: 'deadline' | 'keyword' | 'stakeholder' | 'blocking' | 'custom';
  operator: '<' | '>' | '=' | 'contains' | 'matches';
  value: string | number | string[];
  unit?: 'hours' | 'days' | 'weeks';
  description: string;
  weight?: number;
}

export interface EstimationConfig {
  simpleTaskMinutes: number;
  mediumTaskMinutes: number;
  complexTaskMinutes: number;
  projectTaskMinutes: number;
  keywordMapping: KeywordMapping;
  userAdjustments?: Record<string, number>;
}

export interface KeywordMapping {
  simple: string[];
  medium: string[];
  complex: string[];
  project: string[];
}

export interface RemindersConfig {
  defaultTypes: string[];
  weeklyReview: {
    enabled: boolean;
    day: string;
    time: string;
    description: string;
  };
  customRules: ReminderRule[];
}

export interface ReminderRule {
  condition: string;
  reminders: string[];
  description?: string;
}

export interface TeamConfig {
  manager?: TeamMember;
  frequentCollaborators: TeamMember[];
  departments: string[];
}

export interface TeamMember {
  name: string;
  role: 'manager' | 'lead' | 'team' | 'collaborator';
  keywords: string[];
  priority?: number;
}

export interface IntegrationsConfig {
  appleReminders: AppleRemindersConfig;
  notion: NotionConfig;
  googleCalendar: GoogleCalendarConfig;
}

export interface AppleRemindersConfig {
  enabled: boolean;
  threshold: number;
  unit: 'days' | 'hours';
  defaultList: string;
  lists: Record<string, string>;
}

export interface NotionConfig {
  enabled: boolean;
  threshold: number;
  unit: 'days' | 'hours';
  databaseId: string;
  databaseUrl?: string;
  propertyMappings?: Record<string, string>;
}

export interface GoogleCalendarConfig {
  enabled: boolean;
  defaultCalendar: string;
  conflictDetection: boolean;
  lookAheadDays: number;
}

export interface PreferencesConfig {
  language: 'ja' | 'en';
  dateFormat: string;
  timeFormat: '12h' | '24h';
}

// Default configuration
export const DEFAULT_CONFIG: UserConfig = {
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  user: {
    name: '',
    timezone: 'Asia/Tokyo',
  },
  calendar: {
    workingHours: {
      start: '09:00',
      end: '18:00',
    },
    meetingHeavyDays: ['Tuesday', 'Thursday'],
    deepWorkDays: ['Monday', 'Wednesday', 'Friday'],
    deepWorkBlocks: [],
    timeZone: 'Asia/Tokyo',
  },
  priorityRules: {
    p0Conditions: [
      {
        type: 'deadline',
        operator: '<',
        value: 24,
        unit: 'hours',
        description: 'Due within 24 hours',
      },
      {
        type: 'keyword',
        operator: 'contains',
        value: ['urgent', 'emergency', 'critical', '緊急', '至急'],
        description: 'Contains urgent keywords',
      },
    ],
    p1Conditions: [
      {
        type: 'deadline',
        operator: '<',
        value: 3,
        unit: 'days',
        description: 'Due within 3 days',
      },
      {
        type: 'stakeholder',
        operator: 'contains',
        value: 'manager',
        description: 'Involves manager',
      },
    ],
    p2Conditions: [
      {
        type: 'deadline',
        operator: '<',
        value: 7,
        unit: 'days',
        description: 'Due within a week',
      },
    ],
    defaultPriority: 'P3',
  },
  estimation: {
    simpleTaskMinutes: 25,
    mediumTaskMinutes: 50,
    complexTaskMinutes: 90,
    projectTaskMinutes: 180,
    keywordMapping: {
      simple: ['check', 'review', 'read', 'confirm', '確認', 'レビュー'],
      medium: ['implement', 'fix', 'update', 'create', '実装', '修正', '作成'],
      complex: ['design', 'refactor', 'migrate', 'integrate', '設計', 'リファクタ'],
      project: ['build', 'develop', 'architect', '構築', '開発'],
    },
  },
  reminders: {
    defaultTypes: ['1_day_before', '1_hour_before'],
    weeklyReview: {
      enabled: true,
      day: 'Friday',
      time: '17:00',
      description: 'Weekly task review',
    },
    customRules: [],
  },
  team: {
    frequentCollaborators: [],
    departments: [],
  },
  integrations: {
    appleReminders: {
      enabled: true,
      threshold: 7,
      unit: 'days',
      defaultList: 'Reminders',
      lists: {},
    },
    notion: {
      enabled: false,
      threshold: 8,
      unit: 'days',
      databaseId: '',
    },
    googleCalendar: {
      enabled: false,
      defaultCalendar: 'primary',
      conflictDetection: true,
      lookAheadDays: 14,
    },
  },
  preferences: {
    language: 'ja',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
  },
};
