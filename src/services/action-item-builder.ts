/**
 * Action Item Builder
 *
 * Builds ActionItem objects from raw extracted items,
 * resolving assignees against event attendees and looking up Slack IDs.
 * Also handles deduplication of action items via LLM.
 */

import type { SlackService } from '../integrations/slack-service.js';
import type { SamplingService } from './sampling-service.js';
import type { PromptTemplateManager } from './prompt-templates.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { ActionItem } from '../types/pipeline-types.js';
import { extractJsonFromLlmResponse } from '../utils/llm-response-parser.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('action-item-builder');

export interface RawActionItem {
  description: string;
  assignee?: string;
  dueDate?: string;
}

/**
 * Build a full ActionItem from a raw extracted item, resolving assignee if possible.
 */
export async function buildActionItem(
  event: CalendarEvent,
  raw: RawActionItem,
  index: number,
  defaultDueDate: string,
  slackService: SlackService,
): Promise<ActionItem> {
  const id = `ai-${Date.now()}-${index}`;
  let assigneeEmail: string | undefined;
  let assigneeSlackId: string | undefined;

  if (raw.assignee && event.attendees) {
    const matchedEmail = resolveAssigneeEmail(raw.assignee, event.attendees);
    if (matchedEmail) {
      assigneeEmail = matchedEmail;
      try {
        const slackUser = await slackService.lookupUser(matchedEmail);
        if (slackUser) {
          assigneeSlackId = slackUser.id;
        }
      } catch (error) {
        logger.warn(
          { err: error, email: matchedEmail },
          'Failed to look up Slack user for assignee',
        );
      }
    }
  }

  return {
    id,
    description: raw.description,
    assignee: raw.assignee,
    assigneeEmail,
    assigneeSlackId,
    dueDate: raw.dueDate || defaultDueDate,
    source: 'post-meeting',
    meetingEventId: event.id,
    reminderCreated: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Attempt to match an assignee name to one of the event attendee emails.
 * Uses case-insensitive substring matching on the email local part.
 */
export function resolveAssigneeEmail(
  assigneeName: string,
  attendeeEmails: string[],
): string | undefined {
  const nameLower = assigneeName.toLowerCase().replace(/\s+/g, '');

  for (const email of attendeeEmails) {
    const localPart = email.split('@')[0].toLowerCase().replace(/[._-]/g, '');
    if (localPart.includes(nameLower) || nameLower.includes(localPart)) {
      return email;
    }
  }

  return undefined;
}

/**
 * Deduplicate new action items against existing ones using LLM.
 */
export async function deduplicateActionItems(
  newItems: RawActionItem[],
  existingItems: ActionItem[],
  samplingService: SamplingService,
  promptTemplateManager: PromptTemplateManager,
): Promise<RawActionItem[]> {
  const prompt = promptTemplateManager.getPrompt('action_item_dedup', {
    new_items: JSON.stringify(newItems, null, 2),
    existing_items: JSON.stringify(
      existingItems.map((i) => ({ description: i.description, assignee: i.assignee, dueDate: i.dueDate })),
      null,
      2,
    ),
  });

  const response = await samplingService.sendSamplingRequest({
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
    maxTokens: 4096,
    systemPrompt: 'You are a meeting intelligence assistant.',
  });
  const result = response.content.text;

  try {
    const parsed = extractJsonFromLlmResponse(result) as Record<string, unknown>;
    return Array.isArray(parsed.unique) ? parsed.unique : newItems;
  } catch {
    logger.warn('Failed to parse dedup response, returning all new items');
    return newItems;
  }
}
