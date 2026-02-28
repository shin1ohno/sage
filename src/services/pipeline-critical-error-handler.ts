/**
 * Pipeline Critical Error Handler
 *
 * Detects critical pipeline errors (e.g. token revocation, auth failures)
 * and sends notifications via Slack.
 */

import type { SlackService } from '../integrations/slack-service.js';
import { SlackTokenRevokedError } from '../integrations/slack-service.js';
import type { CriticalPipelineError } from '../types/pipeline-types.js';
import { formatCriticalError } from '../utils/slack-blocks.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pipeline-error-handler');

/**
 * Handle a potentially critical pipeline error by notifying via Slack.
 * Non-critical errors are silently ignored.
 */
export async function handleCriticalError(
  error: unknown,
  slackService: SlackService,
): Promise<void> {
  const isCritical =
    error instanceof SlackTokenRevokedError ||
    (error instanceof Error &&
      (error.message.includes('scope') || error.message.includes('auth')));

  if (!isCritical) {
    return;
  }

  const criticalError: CriticalPipelineError = {
    type: error instanceof SlackTokenRevokedError ? 'SlackTokenRevoked' : 'AuthError',
    message: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
    details: error instanceof Error ? error.stack : undefined,
  };

  const blocks = formatCriticalError(criticalError);

  try {
    await slackService.sendDirectMessage(blocks);
  } catch (sendError) {
    logger.error({ err: sendError }, 'Failed to send critical error notification');
  }
}
