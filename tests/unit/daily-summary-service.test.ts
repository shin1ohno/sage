/**
 * Daily Summary Service Tests
 *
 * Tests for DailySummaryService.checkAndSend: enabled flag, already-sent guard,
 * working hours comparison, and daily reset.
 */

jest.mock('../../src/utils/slack-blocks.js', () => ({
  formatDailySummary: jest.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'summary' } }]),
}));

import { DailySummaryService } from '../../src/services/daily-summary-service.js';
import type { PipelineStatus } from '../../src/types/pipeline-types.js';

const mockSlackService = {
  sendDirectMessage: jest.fn().mockResolvedValue(undefined),
};

const mockStatus: PipelineStatus = {
  isRunning: true,
  briefingsSentToday: 3,
  postMeetingProcessedToday: 1,
  actionItemsCreatedToday: 5,
  errorsToday: 0,
  pendingPostMeetingPolls: 0,
};

function getStatus(): PipelineStatus {
  return mockStatus;
}

describe('DailySummaryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not send when enabled is false', async () => {
    const service = new DailySummaryService(mockSlackService as never, '18:00');
    await service.checkAndSend(false, getStatus);
    expect(mockSlackService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('does not send when already sent today', async () => {
    const service = new DailySummaryService(mockSlackService as never, '00:00');

    await service.checkAndSend(true, getStatus);
    expect(mockSlackService.sendDirectMessage).toHaveBeenCalledTimes(1);

    mockSlackService.sendDirectMessage.mockClear();
    await service.checkAndSend(true, getStatus);
    expect(mockSlackService.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('does not send before working hours end', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-01T10:00:00Z'));

    const service = new DailySummaryService(mockSlackService as never, '23:59');

    await service.checkAndSend(true, getStatus);
    expect(mockSlackService.sendDirectMessage).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('sends when working hours have ended', async () => {
    const service = new DailySummaryService(mockSlackService as never, '00:00');

    await service.checkAndSend(true, getStatus);
    expect(mockSlackService.sendDirectMessage).toHaveBeenCalledTimes(1);
  });
});
