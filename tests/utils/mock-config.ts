/**
 * Mock utilities for testing MCPHandler and related components
 */

import type { UserConfig } from '../../src/types/config.js';

/**
 * Create a minimal valid UserConfig for testing
 */
export function createMockUserConfig(overrides: Partial<UserConfig> = {}): UserConfig {
  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    user: {
      name: 'Test User',
      timezone: 'Asia/Tokyo',
      role: 'developer',
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
      sources: {
        eventkit: {
          enabled: true,
        },
        google: {
          enabled: false,
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
          type: 'keyword',
          operator: 'contains',
          value: ['urgent', 'asap'],
          description: 'Contains urgent keywords',
        },
      ],
      p1Conditions: [],
      p2Conditions: [],
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
      language: 'en',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
    },
    team: {
      frequentCollaborators: [],
      departments: [],
    },
    ...overrides,
  };
}

/**
 * Create mock environment variables for Google OAuth
 */
export function setupGoogleOAuthEnv(): void {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/oauth/callback';
}

/**
 * Clear Google OAuth environment variables
 */
export function clearGoogleOAuthEnv(): void {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
}

/**
 * Create a mock ConfigLoader module
 */
export function createMockConfigLoader(config: UserConfig | null = null) {
  return {
    load: jest.fn().mockResolvedValue(config),
    getConfigPath: jest.fn().mockReturnValue('/mock/config/path'),
  };
}
