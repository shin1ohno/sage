/**
 * Config Reload Tool Handler
 *
 * Business logic for the reload_config MCP tool.
 * Handles manual configuration reload requests.
 */

import type { ReloadResult } from '../../types/hot-reload.js';
import type { ConfigReloadService } from '../../config/config-reload-service.js';
import { createLogger } from '../../utils/logger.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';

const logger = createLogger('reload-handler');

/**
 * Context interface for reload handler
 */
export interface ReloadContext {
  getConfigReloadService: () => ConfigReloadService | null;
}

/**
 * Input parameters for reload_config tool
 */
export interface ReloadConfigInput {
  force?: boolean;
}

/**
 * Handle reload_config tool request
 *
 * Triggers a manual configuration reload without server restart.
 *
 * @param ctx - Context providing access to ConfigReloadService
 * @param params - Optional parameters (force flag)
 * @returns MCP tool response with reload result
 */
export async function handleReloadConfig(
  ctx: ReloadContext,
  params: ReloadConfigInput = {}
) {
  logger.info({ force: params.force }, 'Reload config request received');

  const configReloadService = ctx.getConfigReloadService();

  if (!configReloadService) {
    logger.warn('ConfigReloadService is not available');
    return createToolResponse({
      success: false,
      error: 'Hot reload service is not initialized',
      message:
        'Hot reload機能が初期化されていません。サーバーを再起動してください。',
    });
  }

  try {
    const result: ReloadResult = await configReloadService.reload();

    logger.info(
      {
        success: result.success,
        changedSections: result.changedSections,
        reinitializedServices: result.reinitializedServices,
        durationMs: result.durationMs,
      },
      'Reload config completed'
    );

    if (result.success) {
      return createToolResponse({
        success: true,
        changedSections: result.changedSections,
        reinitializedServices: result.reinitializedServices,
        timestamp: result.timestamp,
        durationMs: result.durationMs,
        message:
          result.changedSections.length > 0
            ? `設定をリロードしました。変更されたセクション: ${result.changedSections.join(', ')}`
            : '設定をリロードしましたが、変更はありませんでした。',
      });
    }

    return createToolResponse({
      success: false,
      error: result.error,
      timestamp: result.timestamp,
      durationMs: result.durationMs,
      message: `設定のリロードに失敗しました: ${result.error}`,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to reload configuration');
    return createErrorFromCatch('設定のリロードに失敗しました', error);
  }
}
