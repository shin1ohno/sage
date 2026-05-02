/**
 * Configuration type definitions
 */

import type { Priority } from './task.js';
import type { MeetingIntelligenceConfig, SlackIntegrationConfig } from './pipeline-config.js';

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
  meetingIntelligence?: MeetingIntelligenceConfig;
  autonomy?: AutonomyConfig;
}

/**
 * Tier 0 = autonomous (immediate execution)
 * Tier 1 = requires explicit confirm_action call
 * Tier 2 = forbidden
 */
export type AutonomyTier = 0 | 1 | 2;

export interface AutonomyConfig {
  /**
   * Per-tool autonomy level. Tools not present default to Tier 1.
   * Keys are MCP tool names (e.g. "create_calendar_event").
   */
  tools: Record<string, AutonomyTier>;
  /** Pending action TTL in minutes; default 30 */
  pendingActionTTLMinutes: number;
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
  sources?: CalendarSources;
}

export interface CalendarSources {
  eventkit: EventKitSourceConfig;
  google: GoogleCalendarSourceConfig;
}

export interface EventKitSourceConfig {
  enabled: boolean;
  /** Explicitly selected calendars (empty means all calendars) - Requirement: multi-calendar-resources 2.3 */
  selectedCalendars?: string[];
}

export interface GoogleCalendarSourceConfig {
  enabled: boolean;
  defaultCalendar: string;
  excludedCalendars: string[];
  /** Explicitly selected calendars (empty means all calendars) - Requirement: multi-calendar-resources 2.3 */
  selectedCalendars?: string[];
  syncInterval: number;
  enableNotifications: boolean;
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
  slack?: SlackIntegrationConfig;
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

/**
 * Get default calendar sources configuration based on platform
 */
function getDefaultCalendarSources(): CalendarSources {
  const isMacOS = typeof process !== 'undefined' && process.platform === 'darwin';

  return {
    eventkit: {
      enabled: isMacOS,
    },
    google: {
      // On non-macOS platforms, enable Google Calendar by default
      // to ensure at least one source is enabled
      enabled: !isMacOS,
      defaultCalendar: 'primary',
      excludedCalendars: [],
      syncInterval: 300,
      enableNotifications: true,
    },
  };
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
    sources: getDefaultCalendarSources(),
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
    slack: {
      enabled: false,
    },
  },
  preferences: {
    language: 'ja',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
  },
  meetingIntelligence: {
    enabled: false,
    briefingWindow: 15,
    preMeetingPollInterval: 5,
    postMeetingPollInterval: 15,
    postMeetingTimeout: 24,
    postMeetingDelay: 30,
    meetingEndBuffer: 10,
    slackLookbackDays: 7,
    slackMessageBatchSize: 50,
    minimumAttendees: 2,
    excludePatterns: [],
    dailySummaryEnabled: true,
    promptsDir: '~/.sage/prompts/',
  },
  autonomy: {
    // Default policy: every write tool requires an explicit confirm_action
    // step (Tier 1). Operators can promote individual tools to Tier 0 in
    // their config to opt back into immediate execution. This matches the
    // reliability roundtable conclusion that "veterans guard the boundary
    // strictly" — confidence is built per-tool, not via a single slider.
    tools: {
      create_calendar_event: 1,
      update_calendar_event: 1,
      delete_calendar_event: 1,
      delete_calendar_events_batch: 1,
      respond_to_calendar_event: 1,
      respond_to_calendar_events_batch: 1,
      set_reminder: 1,
      update_task_status: 1,
      sync_to_notion: 1,
      sync_tasks: 1,
      save_config: 1,
      update_config: 1,
    },
    pendingActionTTLMinutes: 30,
  },
};
