/**
 * Integration Tool Handlers
 *
 * Business logic for integration-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: 8.1-8.5, 10.1-10.6
 */

import type { UserConfig, Priority } from '../../types/index.js';
import type { NotionMCPService } from '../../integrations/notion-mcp.js';
import type { ConfigReloadService } from '../../config/config-reload-service.js';
import { ConfigLoader } from '../../config/loader.js';
import {
  validateConfigUpdate,
  applyConfigUpdates,
} from '../../config/update-validation.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';

/**
 * Integration context containing shared state and services
 */
export interface IntegrationToolsContext {
  getConfig: () => UserConfig | null;
  setConfig: (config: UserConfig) => void;
  getNotionService: () => NotionMCPService | null;
  initializeServices: (config: UserConfig) => void;
  getConfigReloadService?: () => ConfigReloadService | null;
}

// ============================================================
// Input Types
// ============================================================

export interface SyncToNotionInput {
  taskTitle: string;
  description?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  dueDate?: string;
  stakeholders?: string[];
  estimatedMinutes?: number;
}

export interface UpdateConfigInput {
  section:
    | 'user'
    | 'calendar'
    | 'priorityRules'
    | 'integrations'
    | 'team'
    | 'preferences';
  updates: Record<string, unknown>;
}

// ============================================================
// Handler Functions
// ============================================================

/**
 * sync_to_notion handler
 *
 * Sync a task to Notion database for long-term tracking.
 * Requirement: 8.1-8.5
 */
export async function handleSyncToNotion(
  ctx: IntegrationToolsContext,
  args: SyncToNotionInput
) {
  const {
    taskTitle,
    description,
    priority,
    dueDate,
    stakeholders,
    estimatedMinutes,
  } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  if (!config.integrations.notion.enabled) {
    return createToolResponse({
      error: true,
      message:
        'Notion統合が有効になっていません。update_configでNotion設定を更新してください。',
    });
  }

  let notionService = ctx.getNotionService();
  if (!notionService) {
    ctx.initializeServices(config);
    notionService = ctx.getNotionService();
  }

  try {
    // Check if Notion MCP is available
    const isAvailable = await notionService!.isAvailable();

    // Build properties for Notion page
    const properties = notionService!.buildNotionProperties({
      title: taskTitle,
      priority: priority as Priority | undefined,
      deadline: dueDate,
      stakeholders,
      estimatedMinutes,
      description,
    });

    if (!isAvailable) {
      // Generate fallback template for manual copy
      const fallbackText = notionService!.generateFallbackTemplate({
        title: taskTitle,
        priority: priority as Priority | undefined,
        deadline: dueDate,
        stakeholders,
        estimatedMinutes,
        description,
      });

      return createToolResponse({
        success: false,
        method: 'fallback',
        message:
          'Notion MCP統合が利用できません。以下のテンプレートを手動でNotionにコピーしてください。',
        fallbackText,
        task: {
          taskTitle,
          priority: priority ?? 'P3',
          dueDate,
          stakeholders: stakeholders ?? [],
          estimatedMinutes,
        },
      });
    }

    // Create page in Notion via MCP
    const result = await notionService!.createPage({
      databaseId: config.integrations.notion.databaseId,
      title: taskTitle,
      properties,
    });

    if (result.success) {
      return createToolResponse({
        success: true,
        method: 'mcp',
        pageId: result.pageId,
        pageUrl: result.pageUrl,
        message: `Notionにタスクを同期しました: ${taskTitle}`,
      });
    }

    // MCP call failed, provide fallback
    const fallbackText = notionService!.generateFallbackTemplate({
      title: taskTitle,
      priority: priority as Priority | undefined,
      deadline: dueDate,
      stakeholders,
      estimatedMinutes,
      description,
    });

    return createToolResponse({
      success: false,
      method: 'fallback',
      error: result.error,
      message:
        'Notion MCP呼び出しに失敗しました。以下のテンプレートを手動でコピーしてください。',
      fallbackText,
    });
  } catch (error) {
    return createErrorFromCatch('Notion同期に失敗しました', error);
  }
}

/**
 * update_config handler
 *
 * Update sage configuration settings.
 * Requirement: 10.1-10.6
 */
export async function handleUpdateConfig(
  ctx: IntegrationToolsContext,
  args: UpdateConfigInput
) {
  const { section, updates } = args;
  const config = ctx.getConfig();

  if (!config) {
    return createToolResponse({
      error: true,
      message:
        'sageが設定されていません。check_setup_statusを実行してください。',
    });
  }

  try {
    // Validate section-specific updates
    const validationResult = validateConfigUpdate(section, updates);
    if (!validationResult.valid) {
      return createToolResponse({
        error: true,
        message: `設定の検証に失敗しました: ${validationResult.error}`,
        invalidFields: validationResult.invalidFields,
      });
    }

    // Apply updates to config
    const updatedConfig = applyConfigUpdates(config, section, updates);

    // Save the updated config
    await ConfigLoader.save(updatedConfig);
    ctx.setConfig(updatedConfig);

    // Re-initialize services if integrations changed
    if (section === 'integrations') {
      ctx.initializeServices(updatedConfig);
    }

    return createToolResponse({
      success: true,
      section,
      updatedFields: Object.keys(updates),
      message: `設定を更新しました: ${section}`,
    });
  } catch (error) {
    return createErrorFromCatch('設定の更新に失敗しました', error);
  }
}
