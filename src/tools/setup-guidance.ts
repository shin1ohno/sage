/**
 * Setup Guidance
 *
 * Provides structured guidance responses for unconfigured integrations.
 * Returned by tool handlers when a required integration is not set up,
 * enabling the AI client to guide users through setup conversationally.
 */

import type { UserConfig } from '../types/index.js';
import { createToolResponse } from './registry.js';

export interface SetupGuidanceStep {
  step: number;
  description: string;
  detail?: string;
  toolCall?: {
    tool: string;
    args: Record<string, unknown>;
  };
}

export interface SetupGuidanceResponse {
  setupRequired: true;
  integration: string;
  message: string;
  steps: SetupGuidanceStep[];
}

/**
 * Returns guidance for setting up Google Calendar
 */
export function googleCalendarGuidance() {
  const hasEnvVars = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  const steps: SetupGuidanceStep[] = [];

  if (!hasEnvVars) {
    steps.push({
      step: 1,
      description: 'Create Google Cloud OAuth credentials',
      detail: 'Go to https://console.cloud.google.com/apis/credentials, create an OAuth 2.0 Client ID (Desktop type), and enable the Google Calendar API.',
    });
    steps.push({
      step: 2,
      description: 'Set environment variables in your MCP client config',
      detail: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI (default: http://localhost:3000/oauth/callback). Then restart sage.',
    });
    steps.push({
      step: 3,
      description: 'Run authenticate_google tool',
    });
  } else {
    steps.push({
      step: 1,
      description: 'Run authenticate_google tool',
    });
  }

  steps.push({
    step: steps.length + 1,
    description: 'Enable Google Calendar in sage config',
    toolCall: {
      tool: 'update_config',
      args: {
        section: 'integrations',
        updates: { googleCalendar: { enabled: true } },
      },
    },
  });

  return createToolResponse({
    setupRequired: true,
    integration: 'googleCalendar',
    message: 'Google Calendarが設定されていません。以下の手順でセットアップしてください。',
    steps,
  } satisfies SetupGuidanceResponse);
}

/**
 * Returns guidance for setting up Notion integration
 */
export function notionGuidance() {
  return createToolResponse({
    setupRequired: true,
    integration: 'notion',
    message: 'Notion連携が設定されていません。以下の手順でセットアップしてください。',
    steps: [
      {
        step: 1,
        description: 'Create a Notion integration',
        detail: 'Go to https://www.notion.so/my-integrations and create an integration. Copy the Internal Integration Secret.',
      },
      {
        step: 2,
        description: 'Share a database with the integration',
        detail: 'Open the target Notion database, click Share, and add the integration. Copy the database ID from the URL.',
      },
      {
        step: 3,
        description: 'Enable Notion in sage config',
        toolCall: {
          tool: 'update_config',
          args: {
            section: 'integrations',
            updates: {
              notion: { enabled: true, databaseId: '<your-database-id>' },
            },
          },
        },
      },
    ],
  } satisfies SetupGuidanceResponse);
}

/**
 * Returns guidance for Apple Reminders setup
 */
export function appleRemindersGuidance() {
  const isMacOS = process.platform === 'darwin';

  if (!isMacOS) {
    return createToolResponse({
      setupRequired: true,
      integration: 'appleReminders',
      message: 'Apple Remindersはこのプラットフォームでは利用できません。macOSでのみ動作します。',
      steps: [],
    });
  }

  return createToolResponse({
    setupRequired: true,
    integration: 'appleReminders',
    message: 'Apple Remindersのアクセス許可が必要です。',
    steps: [
      {
        step: 1,
        description: 'Grant Reminders permission',
        detail: 'When prompted, allow Terminal (or your MCP host app) to access Reminders in System Settings > Privacy & Security > Reminders.',
      },
      {
        step: 2,
        description: 'Enable Apple Reminders in sage config',
        toolCall: {
          tool: 'update_config',
          args: {
            section: 'integrations',
            updates: { appleReminders: { enabled: true } },
          },
        },
      },
    ],
  });
}

/**
 * Returns a profile-incomplete hint to attach to tool responses
 * when the user's name has not been set yet
 */
export function profileIncompleteHint(config: UserConfig): Record<string, unknown> | null {
  if (config.user.name) {
    return null;
  }

  return {
    profileIncomplete: true,
    hint: 'user.name is not set. Ask the user for their name and timezone, then call update_config.',
    example: {
      tool: 'update_config',
      args: {
        section: 'user',
        updates: { name: '...', timezone: '...' },
      },
    },
  };
}
