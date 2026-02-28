/**
 * Pipeline Scheduler
 *
 * Orchestrates the meeting intelligence pipeline: pre-meeting briefings,
 * post-meeting processing, daily summaries, and error handling.
 */

import type { CalendarSourceManager } from '../integrations/calendar-source-manager.js';
import type { BriefingGenerator } from './briefing-generator.js';
import type { PostMeetingProcessor } from './post-meeting-processor.js';
import type { PipelineStateStore } from './pipeline-state-store.js';
import type { SlackService } from '../integrations/slack-service.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { MeetingIntelligenceConfig } from '../types/pipeline-config.js';
import type { PipelineStatus, PipelineStateFile } from '../types/pipeline-types.js';
import { shouldProcessMeeting } from './meeting-filter.js';
import { DailySummaryService } from './daily-summary-service.js';
import { handleCriticalError } from './pipeline-critical-error-handler.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pipeline-scheduler');

export class PipelineScheduler {
  private readonly calendarSourceManager: CalendarSourceManager;
  private readonly briefingGenerator: BriefingGenerator;
  private readonly postMeetingProcessor: PostMeetingProcessor;
  private readonly stateStore: PipelineStateStore;
  private readonly slackService: SlackService;
  private readonly config: MeetingIntelligenceConfig;
  private readonly dailySummaryService: DailySummaryService;

  private running = false;
  private preMeetingInterval: ReturnType<typeof setInterval> | null = null;
  private postMeetingInterval: ReturnType<typeof setInterval> | null = null;
  private postMeetingQueue: { add: (fn: () => Promise<void>) => Promise<void>; size: number; pending: number } | null = null;
  private readonly pendingPostMeetingEvents: Map<string, { event: CalendarEvent; pollStartedAt: Date }>;

  constructor(
    calendarSourceManager: CalendarSourceManager,
    briefingGenerator: BriefingGenerator,
    postMeetingProcessor: PostMeetingProcessor,
    stateStore: PipelineStateStore,
    slackService: SlackService,
    config: MeetingIntelligenceConfig,
    workingHoursEnd: string,
  ) {
    this.calendarSourceManager = calendarSourceManager;
    this.briefingGenerator = briefingGenerator;
    this.postMeetingProcessor = postMeetingProcessor;
    this.stateStore = stateStore;
    this.slackService = slackService;
    this.config = config;
    this.dailySummaryService = new DailySummaryService(slackService, workingHoursEnd);

    this.pendingPostMeetingEvents = new Map();
  }

  async start(): Promise<void> {
    const { default: PQueue } = await import('p-queue');
    this.postMeetingQueue = new PQueue({ concurrency: 1 });
    this.running = true;
    await this.stateStore.load();
    await this.registerTodaysPastMeetings();

    this.preMeetingInterval = setInterval(
      () => this.checkUpcomingMeetings(),
      this.config.preMeetingPollInterval * 60 * 1000,
    );

    this.postMeetingInterval = setInterval(
      () => this.processPostMeetingQueue(),
      this.config.postMeetingPollInterval * 60 * 1000,
    );

    // Immediate first poll
    this.checkUpcomingMeetings();

    logger.info('Pipeline scheduler started');
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.preMeetingInterval) {
      clearInterval(this.preMeetingInterval);
      this.preMeetingInterval = null;
    }

    if (this.postMeetingInterval) {
      clearInterval(this.postMeetingInterval);
      this.postMeetingInterval = null;
    }

    // Do NOT clear postMeetingQueue (let jobs finish)

    await this.stateStore.flush();

    logger.info('Pipeline scheduler stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): PipelineStatus {
    const today = new Date().toISOString().slice(0, 10);
    const metrics = this.stateStore.getDailyMetrics();
    const dateMatches = metrics.date === today;

    return {
      isRunning: this.running,
      briefingsSentToday: dateMatches ? metrics.briefingsSent : 0,
      postMeetingProcessedToday: dateMatches ? metrics.postMeetingProcessed : 0,
      actionItemsCreatedToday: dateMatches ? metrics.actionItemsCreated : 0,
      errorsToday: dateMatches ? metrics.errors : 0,
      pendingPostMeetingPolls: this.pendingPostMeetingEvents.size,
    };
  }

  private async checkUpcomingMeetings(): Promise<void> {
    if (!this.running) return;

    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + this.config.briefingWindow * 60 * 1000);

      const events = await this.calendarSourceManager.getEvents(
        now.toISOString(),
        windowEnd.toISOString(),
      );

      const filteredEvents = events.filter((event) => shouldProcessMeeting(event, this.config));

      for (const event of filteredEvents) {
        try {
          const existing = this.stateStore.getBriefingStatus(event.id);
          if (existing && (existing.briefing.status === 'sent' || existing.briefing.status === 'skipped')) {
            continue;
          }

          this.ensureMeetingMetadata(event);
          this.stateStore.setBriefingStatus(event.id, { status: 'gathering' });

          const result = await this.briefingGenerator.generateBriefing(event, new Date(event.start));

          if (result.status === 'sent') {
            this.stateStore.setBriefingStatus(event.id, { status: 'sent', sentAt: new Date().toISOString() });
            this.incrementMetric('briefingsSent');
          } else {
            this.stateStore.setBriefingStatus(event.id, { status: 'skipped' });
          }

          // Register for post-meeting if not already registered
          if (!this.pendingPostMeetingEvents.has(event.id)) {
            this.registerForPostMeeting(event);
          }
        } catch (error) {
          this.stateStore.setBriefingStatus(event.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
          this.incrementMetric('errors');
          handleCriticalError(error, this.slackService);
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to check upcoming meetings');
    }
  }

  private registerForPostMeeting(event: CalendarEvent): void {
    const pollStartedAt = new Date();
    this.pendingPostMeetingEvents.set(event.id, { event, pollStartedAt });
    this.stateStore.setPostMeetingStatus(event.id, {
      status: 'waiting',
      pollStartedAt: pollStartedAt.toISOString(),
    });
  }

  private async processPostMeetingQueue(): Promise<void> {
    if (!this.running || !this.postMeetingQueue) return;

    for (const [eventId, { event, pollStartedAt }] of this.pendingPostMeetingEvents) {
      const now = new Date();
      const eventEndTime = new Date(event.end).getTime();
      const eligibleTime = eventEndTime + (this.config.meetingEndBuffer + this.config.postMeetingDelay) * 60 * 1000;

      if (now.getTime() < eligibleTime) {
        continue;
      }

      // Check timeout
      const timeoutMs = this.config.postMeetingTimeout * 60 * 60 * 1000;
      if (now.getTime() - pollStartedAt.getTime() > timeoutMs) {
        this.stateStore.setPostMeetingStatus(eventId, { status: 'timeout' });
        this.pendingPostMeetingEvents.delete(eventId);
        this.incrementMetric('errors');
        continue;
      }

      // Add to queue for processing
      this.postMeetingQueue.add(() => this.pollAndProcessPostMeeting(event));
    }

    // Check daily summary at the end of each post-meeting poll cycle
    await this.dailySummaryService.checkAndSend(
      this.config.dailySummaryEnabled,
      () => this.getStatus(),
    );
  }

  private async pollAndProcessPostMeeting(event: CalendarEvent): Promise<void> {
    this.stateStore.setPostMeetingStatus(event.id, {
      status: 'polling',
      lastPollAt: new Date().toISOString(),
    });

    try {
      const pollResult = await this.postMeetingProcessor.poll(event);

      if (pollResult.status === 'waiting') {
        // Stay in the map for next poll cycle
        return;
      }

      if (pollResult.status === 'ready') {
        const processResult = await this.postMeetingProcessor.process(event, pollResult.transcript, pollResult.notionNotes);
        this.stateStore.setPostMeetingStatus(event.id, {
          status: 'processed',
          processedAt: new Date().toISOString(),
        });

        if (processResult.actionItems.length > 0) {
          this.stateStore.recordActionItems(event.id, processResult.actionItems);
          this.incrementMetric('actionItemsCreated', processResult.actionItems.length);
        }

        this.incrementMetric('postMeetingProcessed');
        this.pendingPostMeetingEvents.delete(event.id);
      }
    } catch (error) {
      this.stateStore.setPostMeetingStatus(event.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      this.incrementMetric('errors');
      this.pendingPostMeetingEvents.delete(event.id);
      handleCriticalError(error, this.slackService);
    }
  }

  private async registerTodaysPastMeetings(): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    try {
      const events = await this.calendarSourceManager.getEvents(
        startOfDay.toISOString(),
        now.toISOString(),
      );

      const filteredEvents = events.filter((event) => shouldProcessMeeting(event, this.config));

      for (const event of filteredEvents) {
        const existing = this.stateStore.getPostMeetingStatus(event.id);
        if (existing && existing.postMeeting.status !== 'pending') {
          continue;
        }

        this.ensureMeetingMetadata(event);
        this.registerForPostMeeting(event);
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to register past meetings');
    }
  }

  private incrementMetric(metric: keyof Omit<PipelineStateFile['dailyMetrics'], 'date'>, value = 1): void {
    this.stateStore.incrementMetric(metric, value);
  }

  private ensureMeetingMetadata(event: CalendarEvent): void {
    this.stateStore.ensureMeetingMetadata(event.id, {
      title: event.title,
      startTime: event.start,
      endTime: event.end,
      recurringEventId: event.recurringEventId,
    });
  }
}
