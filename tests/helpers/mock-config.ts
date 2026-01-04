/**
 * Mock Configuration Helpers
 *
 * Provides test configuration data and factory functions
 * for creating test UserConfig instances.
 */

import type { UserConfig } from '../../src/types/index.js';

/**
 * Default test configuration with realistic values
 */
export const DEFAULT_TEST_CONFIG: UserConfig = {
  version: '1.0.0',
  createdAt: '2024-01-01T00:00:00.000Z',
  lastUpdated: '2024-01-01T00:00:00.000Z',
  user: {
    name: 'Test User',
    email: 'test@example.com',
    timezone: 'Asia/Tokyo',
    role: 'engineer',
  },
  calendar: {
    workingHours: {
      start: '09:00',
      end: '18:00',
    },
    meetingHeavyDays: ['Tuesday', 'Thursday'],
    deepWorkDays: ['Monday', 'Wednesday', 'Friday'],
    deepWorkBlocks: [
      {
        day: 'Monday',
        startHour: 9,
        endHour: 12,
        description: 'Morning deep work',
      },
    ],
    timeZone: 'Asia/Tokyo',
    sources: {
      eventkit: {
        enabled: false,
      },
      google: {
        enabled: true,
        defaultCalendar: 'primary',
        excludedCalendars: [],
        syncInterval: 300,
        enableNotifications: true,
      },
    },
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
    ],
    p1Conditions: [
      {
        type: 'deadline',
        operator: '<',
        value: 3,
        unit: 'days',
        description: 'Due within 3 days',
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
      simple: ['check', 'review'],
      medium: ['implement', 'fix'],
      complex: ['design', 'refactor'],
      project: ['build', 'develop'],
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
    manager: {
      name: 'Test Manager',
      role: 'manager',
      keywords: ['escalate', 'urgent'],
    },
    frequentCollaborators: [
      {
        name: 'Collaborator A',
        role: 'team',
        keywords: ['frontend'],
      },
    ],
    departments: ['Engineering', 'Product'],
  },
  integrations: {
    appleReminders: {
      enabled: true,
      threshold: 7,
      unit: 'days',
      defaultList: 'Reminders',
      lists: {
        work: 'Work Tasks',
        personal: 'Personal',
      },
    },
    notion: {
      enabled: false,
      threshold: 8,
      unit: 'days',
      databaseId: '',
    },
    googleCalendar: {
      enabled: true,
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

/**
 * Configuration with Notion enabled
 */
export const NOTION_ENABLED_CONFIG: UserConfig = {
  ...DEFAULT_TEST_CONFIG,
  integrations: {
    ...DEFAULT_TEST_CONFIG.integrations,
    notion: {
      enabled: true,
      threshold: 8,
      unit: 'days',
      databaseId: 'test-database-id-123',
      databaseUrl: 'https://notion.so/test-database',
    },
  },
};

/**
 * Minimal configuration (setup incomplete)
 */
export const MINIMAL_TEST_CONFIG: UserConfig = {
  ...DEFAULT_TEST_CONFIG,
  user: {
    name: '',
    timezone: 'Asia/Tokyo',
  },
};

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Create a test configuration with optional overrides
 *
 * @param overrides - Partial configuration to merge with defaults
 * @returns Complete UserConfig with overrides applied
 *
 * @example
 * ```typescript
 * const config = createTestConfig({
 *   user: { name: 'Custom User' },
 *   integrations: { notion: { enabled: true } }
 * });
 * ```
 */
export function createTestConfig(overrides?: DeepPartial<UserConfig>): UserConfig {
  if (!overrides) {
    return { ...DEFAULT_TEST_CONFIG };
  }

  return deepMerge(DEFAULT_TEST_CONFIG, overrides) as UserConfig;
}

/**
 * Deep merge utility for configuration objects
 */
function deepMerge<T extends object>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue as DeepPartial<typeof targetValue>);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}
