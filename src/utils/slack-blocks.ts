/**
 * Slack Block Kit formatting utilities for pipeline notifications
 */

import type { PipelineStatus, CriticalPipelineError } from '../types/pipeline-types.js';

/**
 * Format daily summary as Slack Block Kit blocks
 */
export function formatDailySummary(status: PipelineStatus): object[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Meeting Intelligence Daily Summary',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Briefings Sent:* ${status.briefingsSentToday}`,
        },
        {
          type: 'mrkdwn',
          text: `*Post-Meeting Processed:* ${status.postMeetingProcessedToday}`,
        },
        {
          type: 'mrkdwn',
          text: `*Action Items Created:* ${status.actionItemsCreatedToday}`,
        },
        {
          type: 'mrkdwn',
          text: `*Errors:* ${status.errorsToday}`,
        },
      ],
    },
  ];
}

/**
 * Format critical error notification as Slack Block Kit blocks
 */
export function formatCriticalError(error: CriticalPipelineError): object[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Critical Pipeline Error',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Type:* ${error.type}\n*Message:* ${error.message}\n*Time:* ${error.timestamp}`,
      },
    },
  ];
}
