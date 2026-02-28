/**
 * Post-Meeting Processing Service
 *
 * Handles post-meeting intelligence: polls for transcripts and Notion notes,
 * extracts summaries and action items, deduplicates, resolves assignees,
 * creates reminders, and sends Slack reports.
 */

import type { GoogleDriveService } from '../integrations/google-drive-service.js';
import type { SamplingService } from './sampling-service.js';
import type { SlackService } from '../integrations/slack-service.js';
import type { ReminderManager } from '../integrations/reminder-manager.js';
import type { PipelineStateStore } from './pipeline-state-store.js';
import type { PromptTemplateManager } from './prompt-templates.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { PollResult, PostMeetingResult, ActionItem } from '../types/pipeline-types.js';
import type { MeetingIntelligenceConfig } from '../types/pipeline-config.js';
import { extractNotionUrls } from '../utils/calendar-description-parser.js';
import { formatPostMeetingReport } from '../utils/slack-blocks.js';
import { parseExtractResponse } from '../utils/llm-response-parser.js';
import { buildActionItem, deduplicateActionItems } from './action-item-builder.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('post-meeting');

export class PostMeetingProcessor {
  private readonly driveService: GoogleDriveService;
  private readonly samplingService: SamplingService;
  private readonly slackService: SlackService;
  private readonly reminderManager: ReminderManager;
  private readonly stateStore: PipelineStateStore;
  private readonly promptTemplateManager: PromptTemplateManager;
  readonly config: MeetingIntelligenceConfig;

  constructor(
    driveService: GoogleDriveService,
    samplingService: SamplingService,
    slackService: SlackService,
    reminderManager: ReminderManager,
    stateStore: PipelineStateStore,
    promptTemplateManager: PromptTemplateManager,
    config: MeetingIntelligenceConfig,
  ) {
    this.driveService = driveService;
    this.samplingService = samplingService;
    this.slackService = slackService;
    this.reminderManager = reminderManager;
    this.stateStore = stateStore;
    this.promptTemplateManager = promptTemplateManager;
    this.config = config;
  }

  /**
   * Poll for post-meeting sources (transcript + Notion notes).
   * Returns 'waiting' if nothing found yet, 'ready' with content if at least one source found.
   */
  async poll(event: CalendarEvent): Promise<PollResult> {
    let transcript: string | null = null;
    let notionNotes: string | null = null;

    const [transcriptResult, notionResult] = await Promise.allSettled([
      this.pollTranscript(event),
      this.pollNotionNotes(event),
    ]);

    if (transcriptResult.status === 'fulfilled') {
      transcript = transcriptResult.value;
    } else {
      // Graceful degradation: treat Drive errors as transcript not yet available
      logger.warn(
        { err: transcriptResult.reason, eventId: event.id },
        'Drive transcript lookup failed, treating as not yet available',
      );
    }

    if (notionResult.status === 'fulfilled') {
      notionNotes = notionResult.value;
    } else {
      logger.warn(
        { err: notionResult.reason, eventId: event.id },
        'Notion notes lookup failed',
      );
    }

    if (transcript === null && notionNotes === null) {
      return { status: 'waiting' };
    }

    return { status: 'ready', transcript, notionNotes };
  }

  /**
   * Process post-meeting content: extract summary + action items, dedup,
   * resolve assignees, create reminders, send Slack report, and record state.
   */
  async process(
    event: CalendarEvent,
    transcript: string | null,
    notionNotes: string | null,
  ): Promise<PostMeetingResult> {
    // 1. Build sources text for prompt
    const sourceParts: string[] = [];
    if (transcript) {
      sourceParts.push(`## Transcript\n${transcript}`);
    }
    if (notionNotes) {
      sourceParts.push(`## Notion Notes\n${notionNotes}`);
    }
    const sourcesText = sourceParts.join('\n\n');

    // 2. Build and send prompt for post_meeting_extract
    const prompt = this.promptTemplateManager.getPrompt('post_meeting_extract', {
      meeting_title: event.title,
      sources: sourcesText,
    });

    let summary = '';
    let rawActionItems: Array<{ description: string; assignee?: string; dueDate?: string }> = [];
    let sourceLanguage = 'en';

    try {
      const response = await this.samplingService.sendSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });
      const result = response.content.text;

      // 3. Parse response (expect JSON with summary, actionItems[], sourceLanguage)
      const parsed = parseExtractResponse(result);
      summary = parsed.summary;
      rawActionItems = parsed.actionItems;
      sourceLanguage = parsed.sourceLanguage;
    } catch (error) {
      logger.error(
        { err: error, eventId: event.id },
        'Failed to extract meeting content via sampling',
      );
      throw error;
    }

    // 4. Dedup action items against existing recurring items
    const existingItems = this.stateStore.getActionItemsForRecurring(
      event.recurringEventId || '',
      false,
    );

    let uniqueItems = rawActionItems;
    if (existingItems.length > 0 && rawActionItems.length > 0) {
      try {
        uniqueItems = await deduplicateActionItems(rawActionItems, existingItems, this.samplingService, this.promptTemplateManager);
      } catch (error) {
        logger.warn(
          { err: error, eventId: event.id },
          'Action item dedup failed, using all items',
        );
      }
    }

    // 5. Build ActionItem objects with resolved assignees and default due dates
    const defaultDueDate = new Date(
      new Date(event.start).getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString().split('T')[0];

    const actionItems: ActionItem[] = [];
    for (let index = 0; index < uniqueItems.length; index++) {
      const raw = uniqueItems[index];
      const item = await buildActionItem(event, raw, index, defaultDueDate, this.slackService);
      actionItems.push(item);
    }

    // 6. Create reminders for each action item
    for (const item of actionItems) {
      try {
        const reminderResult = await this.reminderManager.setReminder({
          taskTitle: item.description,
          targetDate: item.dueDate,
          notes: `From meeting: ${event.title}`,
        });
        item.reminderCreated = reminderResult.success;

        if (reminderResult.delegateToNotion) {
          logger.info(
            { actionItemId: item.id, eventId: event.id },
            'Reminder delegated to Notion',
          );
        }
      } catch (error) {
        logger.warn(
          { err: error, actionItemId: item.id },
          'Failed to create reminder for action item',
        );
        item.reminderCreated = false;
      }
    }

    // 7. Build source links
    const notionUrls = extractNotionUrls(event.description || '');
    const sourceLinks = {
      notionUrls,
    };

    // 8. Send Slack DM
    try {
      const blocks = formatPostMeetingReport(
        event.title,
        event.start,
        summary,
        sourceLinks,
      );
      await this.slackService.sendDirectMessage(blocks);
    } catch (error) {
      logger.error(
        { err: error, eventId: event.id },
        'Failed to send post-meeting Slack report',
      );
    }

    // 9. Record state
    this.stateStore.recordActionItems(event.id, actionItems);
    this.stateStore.setPostMeetingStatus(event.id, {
      status: 'processed',
      processedAt: new Date().toISOString(),
      sources: {
        transcript: !!transcript,
        notionNotes: !!notionNotes,
      },
    });

    // 10. Return result
    return {
      summary,
      actionItems,
      sourceLanguage,
      sources: { transcript: !!transcript, notionNotes: !!notionNotes },
      sourceLinks,
    };
  }

  /**
   * Poll Google Drive for a meeting transcript.
   */
  private async pollTranscript(event: CalendarEvent): Promise<string | null> {
    const file = await this.driveService.findTranscript(event);
    if (!file) {
      return null;
    }

    return this.driveService.getFileContent(file.id);
  }

  /**
   * Poll for Notion notes linked in the event description.
   * Uses sampling to search Notion for relevant content.
   */
  private async pollNotionNotes(event: CalendarEvent): Promise<string | null> {
    const notionUrls = extractNotionUrls(event.description || '');

    if (notionUrls.length === 0) {
      return null;
    }

    // Use sampling with notion_search prompt to fetch note content
    const prompt = this.promptTemplateManager.getPrompt('notion_search', {
      meeting_title: event.title,
      attendees: (event.attendees || []).join(', '),
    });

    try {
      const response = await this.samplingService.sendSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });
      const result = response.content.text;
      return result || null;
    } catch (error) {
      logger.warn(
        { err: error, eventId: event.id },
        'Failed to fetch Notion notes via sampling',
      );
      return null;
    }
  }

}
