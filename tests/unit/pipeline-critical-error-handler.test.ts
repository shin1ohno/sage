/**
 * Pipeline Critical Error Handler Tests
 *
 * Tests for handleCriticalError: SlackTokenRevokedError detection,
 * auth/scope error detection, non-critical error passthrough,
 * and Slack send failure handling.
 */

jest.mock('../../src/utils/slack-blocks.js', () => ({
  formatCriticalError: jest.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'error' } }]),
}));

import { handleCriticalError } from '../../src/services/pipeline-critical-error-handler.js';
import { SlackTokenRevokedError } from '../../src/integrations/slack-service.js';

const mockSlackService = {
  sendDirectMessage: jest.fn().mockResolvedValue(undefined),
};

describe('handleCriticalError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends notification for SlackTokenRevokedError', async () => {
    const error = new SlackTokenRevokedError('token_revoked');
    await handleCriticalError(error, mockSlackService as never);
    expect(mockSlackService.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it('sends notification for auth-related errors', async () => {
    const error = new Error('Google auth failed');
    await handleCriticalError(error, mockSlackService as never);
    expect(mockSlackService.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it('sends notification for scope-related errors', async () => {
    const error = new Error('Insufficient scope for Calendar API');
    await handleCriticalError(error, mockSlackService as never);
    expect(mockSlackService.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it('does nothing for non-critical errors', async () => {
    const error = new Error('Network timeout');
    await handleCriticalError(error, mockSlackService as never);
    expect(mockSlackService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('logs but does not throw when Slack send fails', async () => {
    const error = new SlackTokenRevokedError('token_revoked');
    mockSlackService.sendDirectMessage.mockRejectedValueOnce(new Error('Slack down'));
    await expect(handleCriticalError(error, mockSlackService as never)).resolves.toBeUndefined();
  });
});
