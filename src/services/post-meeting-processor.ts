/**
 * PostMeetingProcessor
 *
 * Processes meetings after they end to extract summaries and action items
 * from transcripts and Notion notes, then delivers formatted reports
 * via Slack DM.
 *
 * Requirements: R4.1-R4.11
 */

import { createLogger } from '../utils/logger.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';

const logger = createLogger('post-meeting');

// Re-export shared types (will come from pipeline-types.ts when available)

export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  assigneeEmail?: string;
  assigneeSlackId?: string;
  dueDate: string;
  source: string;
  meetingEventId: string;
  reminderCreated: boolean;
  createdAt: string;
}

export interface SourceLinks {
  notionUrls: string[];
  transcriptUrl?: string;
  slackChannelUrls?: string[];
}

export type PollResult =
  | { status: 'waiting' }
  | { status: 'ready'; transcript: string | null; notionNotes: string | null };

export interface PostMeetingResult {
  summary: string;
  actionItems: ActionItem[];
  sources: { transcript: boolean; notionNotes: boolean };
  sourceLinks: SourceLinks;
}

// Dependency interfaces

export interface SlackServiceInterface {
  sendDirectMessage(blocks: any[]): Promise<string>;
  lookupUser(email: string): Promise<string | null>;
}

export interface GoogleDriveServiceInterface {
  findTranscript(event: CalendarEvent): Promise<{ id: string; name: string } | null>;
  getFileContent(fileId: string): Promise<string>;
}

export interface PromptTemplateManagerInterface {
  getPrompt(name: string, vars: Record<string, any>): string;
}

export interface PipelineStateStoreService {
  getMeetingState(id: string): any;
  updateMeetingState(id: string, update: any): void;
  getActionItemsForRecurring(recurringEventId: string, lastOnly: boolean): ActionItem[];
  recordActionItems(eventId: string, items: ActionItem[]): void;
  setPostMeetingStatus(eventId: string, status: {
    status: string;
    pollStartedAt?: string;
    lastPollAt?: string;
    processedAt?: string;
    sources?: { transcript: boolean; notionNotes: boolean };
    error?: string;
  }): void;
  save(): Promise<void>;
}

export interface SamplingServiceInterface {
  createMessage(params: any): Promise<any>;
}

export interface MeetingIntelligenceConfig {
  enabled: boolean;
  briefingWindow: number;
  slackLookbackDays: number;
  slackMessageBatchSize: number;
  minimumAttendees: number;
  postMeetingPollInterval: number;
  postMeetingTimeout: number;
  postMeetingDelay: number;
  meetingEndBuffer: number;
  excludePatterns: Array<{ type: string; pattern: string }>;
  dailySummaryEnabled: boolean;
  promptsDir: string;
  preMeetingPollInterval: number;
}

// Utility function types
type ExtractNotionUrlsFn = (description: string | undefined) => string[];
type FormatPostMeetingReportFn = (title: string, start: string, summary: string, sourceLinks: SourceLinks) => any[];

/**
 * PostMeetingProcessor class
 *
 * Orchestrates the post-meeting processing flow:
 * 1. Poll for transcript/notes readiness
 * 2. Extract summary and action items via LLM
 * 3. Deduplicate action items
 * 4. Format and send report via Slack DM
 * 5. Update meeting state
 */
export class PostMeetingProcessor {
  private slackService: SlackServiceInterface;
  private googleDriveService: GoogleDriveServiceInterface;
  private promptTemplateManager: PromptTemplateManagerInterface;
  private pipelineStateStore: PipelineStateStoreService;
  private samplingService: SamplingServiceInterface;
  private extractNotionUrls: ExtractNotionUrlsFn;
  private formatPostMeetingReport: FormatPostMeetingReportFn;

  constructor(
    slackService: SlackServiceInterface,
    googleDriveService: GoogleDriveServiceInterface,
    promptTemplateManager: PromptTemplateManagerInterface,
    pipelineStateStore: PipelineStateStoreService,
    samplingService: SamplingServiceInterface,
    _config: MeetingIntelligenceConfig,
    extractNotionUrls: ExtractNotionUrlsFn = defaultExtractNotionUrls,
    formatPostMeetingReport: FormatPostMeetingReportFn = defaultFormatPostMeetingReport,
  ) {
    this.slackService = slackService;
    this.googleDriveService = googleDriveService;
    this.promptTemplateManager = promptTemplateManager;
    this.pipelineStateStore = pipelineStateStore;
    this.samplingService = samplingService;
    this.extractNotionUrls = extractNotionUrls;
    this.formatPostMeetingReport = formatPostMeetingReport;
  }

  /**
   * Poll for transcript and Notion notes readiness.
   * Returns 'waiting' if neither source is available, 'ready' otherwise.
   */
  async pollForReadiness(event: CalendarEvent): Promise<PollResult> {
    try {
      const [transcriptResult, notionNotesResult] = await Promise.all([
        this.findTranscript(event),
        this.findNotionNotes(event),
      ]);

      if (!transcriptResult && !notionNotesResult) {
        return { status: 'waiting' };
      }

      return {
        status: 'ready',
        transcript: transcriptResult,
        notionNotes: notionNotesResult,
      };
    } catch (error) {
      logger.warn({ eventId: event.id, error }, 'Error during poll for readiness');
      return { status: 'waiting' };
    }
  }

  /**
   * Process a meeting after it ends: extract summary, action items,
   * send report, and update state.
   */
  async processPostMeeting(event: CalendarEvent): Promise<PostMeetingResult | null> {
    try {
      // 1. Check if already processed
      const existingState = this.pipelineStateStore.getMeetingState(event.id);
      if (existingState?.postMeeting?.status === 'processed') {
        logger.info({ eventId: event.id }, 'Post-meeting already processed, skipping');
        return null;
      }

      // 2. Poll for readiness
      const pollResult = await this.pollForReadiness(event);
      if (pollResult.status === 'waiting') {
        logger.info({ eventId: event.id }, 'Sources not ready yet');
        this.pipelineStateStore.setPostMeetingStatus(event.id, {
          status: 'polling',
          lastPollAt: new Date().toISOString(),
        });
        return null;
      }

      const { transcript, notionNotes } = pollResult;

      // 3. Extract summary and action items via LLM
      const extractPrompt = this.promptTemplateManager.getPrompt('post_meeting_extract', {
        title: event.title,
        start: event.start,
        attendees: event.attendees ?? [],
        transcript: transcript ?? '',
        notionNotes: notionNotes ?? '',
      });

      const extractResponse = await this.samplingService.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: extractPrompt } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });

      let extracted: { summary: string; actionItems: Array<{ description: string; assignee?: string; dueDate?: string }> };
      try {
        extracted = JSON.parse(extractResponse.content.text);
      } catch {
        logger.warn({ eventId: event.id }, 'Failed to parse LLM extraction response, using raw text');
        extracted = { summary: extractResponse.content.text, actionItems: [] };
      }

      // 4. Deduplicate action items
      let actionItems = extracted.actionItems;
      if (event.recurringEventId && actionItems.length > 0) {
        const existingItems = this.pipelineStateStore.getActionItemsForRecurring(event.recurringEventId, false);
        if (existingItems.length > 0) {
          const dedupPrompt = this.promptTemplateManager.getPrompt('action_item_dedup', {
            newItems: actionItems,
            existingItems,
          });

          const dedupResponse = await this.samplingService.createMessage({
            messages: [{ role: 'user', content: { type: 'text', text: dedupPrompt } }],
            maxTokens: 2048,
            systemPrompt: 'You are a meeting intelligence assistant.',
          });

          try {
            actionItems = JSON.parse(dedupResponse.content.text);
          } catch {
            logger.warn({ eventId: event.id }, 'Failed to parse dedup response, keeping original items');
          }
        }
      }

      // 5. Resolve assignees and build ActionItem objects
      const defaultDueDate = new Date(event.start);
      defaultDueDate.setDate(defaultDueDate.getDate() + 7);

      const resolvedActionItems: ActionItem[] = await Promise.all(
        actionItems.map(async (item, index) => {
          let assigneeSlackId: string | undefined;
          let assigneeEmail: string | undefined;

          if (item.assignee && event.attendees) {
            // Try to match assignee name to attendee email
            const matchedEmail = event.attendees.find((email) =>
              email.toLowerCase().includes(item.assignee!.toLowerCase().split(' ')[0]),
            );
            if (matchedEmail) {
              assigneeEmail = matchedEmail;
              try {
                const slackId = await this.slackService.lookupUser(matchedEmail);
                if (slackId) {
                  assigneeSlackId = slackId;
                }
              } catch (err) {
                logger.warn({ email: matchedEmail, error: err }, 'Failed to lookup Slack user');
              }
            }
          }

          return {
            id: `${event.id}-action-${index}`,
            description: item.description,
            assignee: item.assignee,
            assigneeEmail,
            assigneeSlackId,
            dueDate: item.dueDate ?? defaultDueDate.toISOString(),
            source: transcript ? 'transcript' : 'notion',
            meetingEventId: event.id,
            reminderCreated: false,
            createdAt: new Date().toISOString(),
          };
        }),
      );

      // 6. Collect source links
      const notionUrls = this.extractNotionUrls(event.description);
      const sourceLinks: SourceLinks = {
        notionUrls,
      };

      // 7. Format and send Slack DM
      const blocks = this.formatPostMeetingReport(
        event.title,
        event.start,
        extracted.summary,
        sourceLinks,
      );
      await this.slackService.sendDirectMessage(blocks);

      // 8. Update state
      this.pipelineStateStore.recordActionItems(event.id, resolvedActionItems);
      this.pipelineStateStore.setPostMeetingStatus(event.id, {
        status: 'processed',
        processedAt: new Date().toISOString(),
        sources: {
          transcript: !!transcript,
          notionNotes: !!notionNotes,
        },
      });

      const result: PostMeetingResult = {
        summary: extracted.summary,
        actionItems: resolvedActionItems,
        sources: {
          transcript: !!transcript,
          notionNotes: !!notionNotes,
        },
        sourceLinks,
      };

      logger.info({ eventId: event.id, actionItemCount: resolvedActionItems.length }, 'Post-meeting processed');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ eventId: event.id, error: message }, 'Failed to process post-meeting');
      this.pipelineStateStore.setPostMeetingStatus(event.id, {
        status: 'error',
        error: message,
      });
      return null;
    }
  }

  /**
   * Find transcript for the event via Google Drive.
   */
  private async findTranscript(event: CalendarEvent): Promise<string | null> {
    // Skip transcript search for EventKit events without conference data
    // conferenceData will be added to CalendarEvent by Layer 1 Task 5
    if (event.source === 'eventkit' && !(event as any).conferenceData) {
      return null;
    }

    try {
      const file = await this.googleDriveService.findTranscript(event);
      if (!file) return null;
      return await this.googleDriveService.getFileContent(file.id);
    } catch (err) {
      logger.warn({ eventId: event.id, error: err }, 'Failed to find transcript');
      return null;
    }
  }

  /**
   * Find Notion notes for the event from description URLs.
   */
  private async findNotionNotes(event: CalendarEvent): Promise<string | null> {
    const notionUrls = this.extractNotionUrls(event.description);
    if (notionUrls.length === 0) return null;

    try {
      const response = await this.samplingService.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: `Retrieve and summarize the Notion meeting notes from: ${notionUrls.join(', ')}` } }],
        maxTokens: 4096,
        systemPrompt: 'You are a meeting intelligence assistant.',
      });
      return response.content.text;
    } catch (err) {
      logger.warn({ eventId: event.id, error: err }, 'Failed to retrieve Notion notes');
      return null;
    }
  }
}

// Default stub implementations for utility functions
function defaultExtractNotionUrls(_description: string | undefined): string[] {
  return [];
}

function defaultFormatPostMeetingReport(title: string, _start: string, summary: string, _sourceLinks: SourceLinks): any[] {
  return [{ type: 'section', text: { type: 'mrkdwn', text: `*${title} - Summary*\n${summary}` } }];
}
