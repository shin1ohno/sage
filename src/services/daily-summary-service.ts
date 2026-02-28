/**
 * Daily Summary Service
 *
 * Checks working hours and sends a daily pipeline summary via Slack
 * when the working day ends.
 */

import type { SlackService } from '../integrations/slack-service.js';
import type { PipelineStatus } from '../types/pipeline-types.js';
import { formatDailySummary } from '../utils/slack-blocks.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('daily-summary');

export class DailySummaryService {
  private readonly slackService: SlackService;
  private readonly workingHoursEnd: string;
  private sent = false;
  private date = '';

  constructor(slackService: SlackService, workingHoursEnd: string) {
    this.slackService = slackService;
    this.workingHoursEnd = workingHoursEnd;
  }

  /**
   * Check if it's time to send a daily summary and send it if so.
   */
  async checkAndSend(
    enabled: boolean,
    getStatus: () => PipelineStatus,
  ): Promise<void> {
    if (!enabled) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    if (this.date !== today) {
      this.sent = false;
      this.date = today;
    }

    if (this.sent) {
      return;
    }

    try {
      const [endHour, endMinute] = this.workingHoursEnd.split(':').map(Number);

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      if (currentHour > endHour || (currentHour === endHour && currentMinute >= endMinute)) {
        const status = getStatus();
        const blocks = formatDailySummary(status);
        await this.slackService.sendDirectMessage(blocks);
        this.sent = true;
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to send daily summary');
    }
  }
}
