/**
 * Setup Tool Handlers
 *
 * Business logic for setup-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: 1.1-1.6
 */

import { ConfigLoader } from '../../config/loader.js';
import type { UserConfig } from '../../types/index.js';
import type { ReloadResult } from '../../types/hot-reload.js';
import type { ConfigReloadService } from '../../config/config-reload-service.js';
import { createToolResponse } from '../registry.js';

/**
 * Setup context containing shared state
 */
export interface SetupContext {
  getConfig: () => UserConfig | null;
  setConfig: (config: UserConfig) => void;
  initializeServices: (config: UserConfig) => void;
  getConfigReloadService?: () => ConfigReloadService | null;
}

/**
 * check_setup_status handler
 *
 * Returns diagnostic view of configuration and integration health.
 * Requirement: 1.1, 1.2
 */
export async function handleCheckSetupStatus(ctx: SetupContext) {
  const exists = await ConfigLoader.exists();
  const config = ctx.getConfig();

  if (!exists || !config) {
    return createToolResponse({
      setupComplete: false,
      configExists: exists,
      message:
        'sageの設定ファイルが見つかりません。再起動すると自動的にデフォルト設定が作成されます。',
    });
  }

  const isMacOS = process.platform === 'darwin';
  const hasGoogleEnvVars = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  // Build integration status
  const integrations = {
    eventKit: {
      available: isMacOS,
      enabled: config.calendar?.sources?.eventkit?.enabled ?? false,
    },
    googleCalendar: {
      enabled: config.integrations?.googleCalendar?.enabled ?? false,
      envVarsSet: hasGoogleEnvVars,
    },
    appleReminders: {
      available: isMacOS,
      enabled: config.integrations?.appleReminders?.enabled ?? false,
    },
    notion: {
      enabled: config.integrations?.notion?.enabled ?? false,
      databaseId: config.integrations?.notion?.databaseId || null,
    },
    slack: {
      enabled: config.integrations?.slack?.enabled ?? false,
    },
  };

  // Build suggestions
  const suggestions: string[] = [];
  if (!config.user.name) {
    suggestions.push('user.name is not set. Use update_config to set your name.');
  }
  if (!isMacOS && !integrations.googleCalendar.enabled) {
    suggestions.push('No calendar source enabled. Set up Google Calendar for calendar features.');
  }
  if (integrations.googleCalendar.enabled && !hasGoogleEnvVars) {
    suggestions.push('Google Calendar enabled but GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars not set.');
  }

  // Build hot reload status if service is available
  let hotReload: {
    enabled: boolean;
    watching: boolean;
    lastReload: ReloadResult | null;
  } | undefined;

  if (ctx.getConfigReloadService) {
    const configReloadService = ctx.getConfigReloadService();
    if (configReloadService) {
      hotReload = {
        enabled: configReloadService.isAutoReloadEnabled(),
        watching: configReloadService.isAutoReloadEnabled(),
        lastReload: configReloadService.getLastReloadResult(),
      };
    }
  }

  return createToolResponse({
    setupComplete: true,
    configExists: true,
    user: {
      name: config.user.name || null,
      timezone: config.user.timezone,
    },
    integrations,
    suggestions,
    ...(hotReload && { hotReload }),
  });
}

/**
 * start_setup_wizard handler (DEPRECATED)
 *
 * Returns deprecation notice. Sage now auto-configures on first connection.
 */
export async function handleStartSetupWizard(
  _ctx: SetupContext,
  _args: { mode?: 'full' | 'quick' }
) {
  return createToolResponse({
    deprecated: true,
    message: 'セットアップウィザードは廃止されました。sageは初回接続時に自動でデフォルト設定を作成します。設定の変更にはupdate_configを使用してください。',
    alternative: 'update_config',
  });
}

/**
 * answer_wizard_question handler (DEPRECATED)
 *
 * Returns deprecation notice.
 */
export async function handleAnswerWizardQuestion(
  _ctx: SetupContext,
  _args: { questionId: string; answer: string | string[] }
) {
  return createToolResponse({
    deprecated: true,
    message: 'セットアップウィザードは廃止されました。設定の変更にはupdate_configを使用してください。',
    alternative: 'update_config',
  });
}

/**
 * save_config handler (DEPRECATED)
 *
 * Returns deprecation notice.
 */
export async function handleSaveConfig(
  _ctx: SetupContext,
  _args: { confirm: boolean }
) {
  return createToolResponse({
    deprecated: true,
    message: 'セットアップウィザードは廃止されました。設定の変更にはupdate_configを使用してください。',
    alternative: 'update_config',
  });
}
