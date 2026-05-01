/**
 * PipelineScheduler
 * Orchestrates the Meeting Intelligence Pipeline lifecycle:
 *   - Pre-meeting briefing generation
 *   - Post-meeting processing with polling and p-queue
 *   - Daily summary and critical error notifications
 */

import { createLogger } from '../utils/logger.js';
import { formatDailySummary, formatCriticalError } from '../utils/slack-blocks.js';
import { shouldProcessMeeting } from './meeting-filter.js';
import { ConfigLoader } from '../config/loader.js';
import { KillSwitch } from './reliability/kill-switch.js';
import { Heartbeat } from './reliability/heartbeat.js';
import type { CalendarEvent } from '../types/google-calendar-types.js';
import type { MeetingIntelligenceConfig } from '../types/pipeline-config.js';
import type {
  PipelineStatus,
  CriticalPipelineError,
  PipelineStateFile,
  BriefingResult,
  PollResult,
  PostMeetingResult,
} from '../types/pipeline-types.js';

const logger = createLogger('pipeline-scheduler');

// ----------------------------------------------------------------
// Dependency interfaces — kept minimal to decouple from concrete impls
// ----------------------------------------------------------------

export interface CalendarSourceManagerDep {
  getEvents(startDate: string, endDate: string): Promise<CalendarEvent[]>;
}

export interface BriefingGeneratorDep {
  generateBriefing(event: CalendarEvent, deadline: Date): Promise<BriefingResult>;
}

export interface PostMeetingProcessorDep {
  poll(event: CalendarEvent): Promise<PollResult>;
  process(
    event: CalendarEvent,
    transcript: string | undefined,
    notionNotes: string | undefined
  ): Promise<PostMeetingResult>;
}

export interface PipelineStateStoreDep {
  load(): Promise<void>;
  save(): void;
  flush(): Promise<void>;
  getBriefingStatus(eventId: string): { status: string } | null;
  setBriefingStatus(eventId: string, status: Record<string, unknown>): void;
  getPostMeetingStatus(eventId: string): { status: string } | null;
  setPostMeetingStatus(eventId: string, status: Record<string, unknown>): void;
  getState(): PipelineStateFile;
  getMeeting(eventId: string): { title?: string } | null;
}

export interface SlackServiceDep {
  sendDirectMessage(blocks: object[]): Promise<unknown>;
}

export interface WorkingCadenceServiceDep {
  // Placeholder — daily summary uses ConfigLoader directly
}

export interface PQueueLike {
  add(fn: () => Promise<void>): Promise<void>;
  size: number;
  pending: number;
  clear(): void;
}

// ----------------------------------------------------------------
// PipelineScheduler
// ----------------------------------------------------------------

export class PipelineScheduler {
  private running = false;
  private preMeetingInterval: ReturnType<typeof setInterval> | null = null;
  private postMeetingInterval: ReturnType<typeof setInterval> | null = null;
  private postMeetingQueue: PQueueLike;
  private pendingPostMeetingEvents = new Map<
    string,
    { event: CalendarEvent; pollStartedAt: Date }
  >();
  private dailySummarySent = false;
  private dailySummaryDate = '';
  private readonly killSwitch: KillSwitch = new KillSwitch();
  private readonly heartbeat: Heartbeat = new Heartbeat();

  constructor(
    private readonly calendarSourceManager: CalendarSourceManagerDep,
    private readonly briefingGenerator: BriefingGeneratorDep,
    private readonly postMeetingProcessor: PostMeetingProcessorDep,
    private readonly stateStore: PipelineStateStoreDep,
    _workingCadenceService: WorkingCadenceServiceDep,
    private readonly slackService: SlackServiceDep,
    private readonly config: MeetingIntelligenceConfig,
    pQueue?: PQueueLike
  ) {
    // Allow injecting a PQueue-like object for testing; production code
    // would pass a real PQueue instance.
    this.postMeetingQueue = pQueue ?? { add: async (fn) => { await fn(); }, size: 0, pending: 0, clear: () => {} };
  }

  // ---- Lifecycle ------------------------------------------------

  async start(): Promise<void> {
    this.running = true;
    await this.stateStore.load();

    // Register today's past meetings for post-meeting polling
    await this.registerTodaysPastMeetings();

    // Set up polling intervals
    this.preMeetingInterval = setInterval(
      () => { void this.checkUpcomingMeetings(); },
      this.config.preMeetingPollInterval * 60_000
    );

    this.postMeetingInterval = setInterval(
      () => { void this.processPostMeetingQueue(); },
      this.config.postMeetingPollInterval * 60_000
    );

    // Immediate first poll
    void this.checkUpcomingMeetings();

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

    // Let in-flight p-queue jobs finish — do NOT call queue.clear()
    await this.stateStore.flush();
    logger.info('Pipeline scheduler stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): PipelineStatus {
    const state = this.stateStore.getState();
    const today = new Date().toISOString().split('T')[0];
    const todayMetrics = state.dailyMetrics[today];

    return {
      isRunning: this.running,
      briefingsSentToday: todayMetrics?.briefingsSent ?? 0,
      postMeetingProcessedToday: todayMetrics?.postMeetingProcessed ?? 0,
      actionItemsCreatedToday: todayMetrics?.actionItemsCreated ?? 0,
      errorsToday: todayMetrics?.errors ?? 0,
      pendingPostMeetingPolls: this.pendingPostMeetingEvents.size,
    };
  }

  // ---- Pre-meeting ----------------------------------------------

  async checkUpcomingMeetings(): Promise<void> {
    if (!this.running) return;
    if (this.killSwitch.isActive()) {
      logger.warn({ path: this.killSwitch.getPath() }, 'kill switch active; skipping pre-meeting tick');
      return;
    }

    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.config.briefingWindow * 60_000);

    logger.info({ start: now.toISOString(), end: windowEnd.toISOString() }, 'Checking upcoming meetings');

    let events: CalendarEvent[];
    try {
      events = await this.calendarSourceManager.getEvents(
        now.toISOString(),
        windowEnd.toISOString()
      );
    } catch (err) {
      logger.error({ err }, 'Failed to fetch upcoming meetings');
      return;
    }

    for (const event of events) {
      if (!shouldProcessMeeting(event, this.config)) continue;

      try {
        const existing = this.stateStore.getBriefingStatus(event.id);
        if (existing && (existing.status === 'sent' || existing.status === 'skipped')) {
          continue;
        }

        this.stateStore.setBriefingStatus(event.id, { status: 'gathering' });
        this.ensureMeetingMetadata(event);

        const deadline = new Date(event.start);
        const result = await this.briefingGenerator.generateBriefing(event, deadline);

        if (result.status === 'sent') {
          this.stateStore.setBriefingStatus(event.id, {
            status: 'sent',
            sentAt: new Date().toISOString(),
          });
          this.incrementMetric('briefingsSent');
        } else if (result.status === 'skipped') {
          this.stateStore.setBriefingStatus(event.id, { status: 'skipped' });
        }

        // Register for post-meeting processing if not already registered
        if (!this.pendingPostMeetingEvents.has(event.id)) {
          this.registerForPostMeeting(event);
        }
      } catch (err) {
        this.stateStore.setBriefingStatus(event.id, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        this.incrementMetric('errors');
        await this.handleCriticalError(err);
        logger.error({ err, eventTitle: event.title }, 'Failed to process briefing');
      }
    }

    this.heartbeat.touch('pipeline.preMeeting', this.config.preMeetingPollInterval * 60);
  }

  // ---- Post-meeting ---------------------------------------------

  private registerForPostMeeting(event: CalendarEvent): void {
    this.pendingPostMeetingEvents.set(event.id, {
      event,
      pollStartedAt: new Date(),
    });
    this.stateStore.setPostMeetingStatus(event.id, {
      status: 'waiting',
      pollStartedAt: new Date().toISOString(),
    });
    this.ensureMeetingMetadata(event);
    logger.info({ eventTitle: event.title }, 'Registered meeting for post-meeting polling');
  }

  async processPostMeetingQueue(): Promise<void> {
    if (
      !this.running &&
      this.postMeetingQueue.size === 0 &&
      this.postMeetingQueue.pending === 0
    ) {
      return;
    }
    if (this.killSwitch.isActive()) {
      logger.warn({ path: this.killSwitch.getPath() }, 'kill switch active; skipping post-meeting tick');
      return;
    }

    const now = new Date();

    for (const [eventId, entry] of this.pendingPostMeetingEvents) {
      const { event, pollStartedAt } = entry;

      // Calculate eligible time: event end + buffer + delay
      const eventEnd = new Date(event.end).getTime();
      const eligibleTime = eventEnd +
        this.config.meetingEndBuffer * 60_000 +
        this.config.postMeetingDelay * 60_000;

      if (now.getTime() < eligibleTime) {
        continue; // Not yet eligible
      }

      // Timeout check
      const timeoutMs = this.config.postMeetingTimeout * 3_600_000;
      if (now.getTime() - pollStartedAt.getTime() > timeoutMs) {
        this.stateStore.setPostMeetingStatus(eventId, { status: 'timeout' });
        this.pendingPostMeetingEvents.delete(eventId);
        this.incrementMetric('errors');
        logger.warn({ eventTitle: event.title }, 'Post-meeting polling timed out');
        continue;
      }

      // Enqueue for processing
      void this.postMeetingQueue.add(async () => {
        await this.pollAndProcessPostMeeting(event);
      });
    }

    // Check daily summary
    await this.checkDailySummary();

    this.heartbeat.touch('pipeline.postMeeting', this.config.postMeetingPollInterval * 60);
  }

  private async pollAndProcessPostMeeting(event: CalendarEvent): Promise<void> {
    try {
      this.stateStore.setPostMeetingStatus(event.id, {
        status: 'polling',
        lastPollAt: new Date().toISOString(),
      });

      const pollResult = await this.postMeetingProcessor.poll(event);

      if (pollResult.status === 'waiting') {
        return; // Will retry on next polling cycle
      }

      if (pollResult.status === 'ready') {
        const result = await this.postMeetingProcessor.process(
          event,
          pollResult.transcript ?? undefined,
          pollResult.notionNotes ?? undefined
        );
        this.stateStore.setPostMeetingStatus(event.id, {
          status: 'processed',
          processedAt: new Date().toISOString(),
          sources: result.sources,
        });
        this.incrementMetric('postMeetingProcessed');
        this.incrementMetric('actionItemsCreated', result.actionItems.length);
        this.pendingPostMeetingEvents.delete(event.id);
        logger.info({ eventTitle: event.title }, 'Post-meeting processing completed');
      }
    } catch (err) {
      this.stateStore.setPostMeetingStatus(event.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
      this.incrementMetric('errors');
      await this.handleCriticalError(err);
      logger.error({ err, eventTitle: event.title }, 'Post-meeting processing failed');
    }
  }

  private async registerTodaysPastMeetings(): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let events: CalendarEvent[];
    try {
      events = await this.calendarSourceManager.getEvents(
        startOfDay.toISOString(),
        now.toISOString()
      );
    } catch (err) {
      logger.error({ err }, 'Failed to fetch today\'s past meetings');
      return;
    }

    let count = 0;
    for (const event of events) {
      if (!shouldProcessMeeting(event, this.config)) continue;
      if (this.stateStore.getPostMeetingStatus(event.id)) continue;
      this.registerForPostMeeting(event);
      count++;
    }

    logger.info({ count }, `Registered ${count} past meetings for post-meeting polling`);
  }

  // ---- Daily summary --------------------------------------------

  private async checkDailySummary(): Promise<void> {
    if (!this.config.dailySummaryEnabled) return;

    const today = new Date().toISOString().split('T')[0];

    if (this.dailySummarySent && this.dailySummaryDate === today) {
      return; // Already sent today
    }

    // Reset if date changed
    if (this.dailySummaryDate !== today) {
      this.dailySummarySent = false;
    }

    // Check if past working hours end
    try {
      const userConfig = await ConfigLoader.load();
      const endTime = userConfig.calendar.workingHours.end; // e.g. "18:00"
      const timezone = userConfig.user.timezone;

      const now = new Date();
      // Build today's end-of-work time in the user's timezone
      const [endHour, endMinute] = endTime.split(':').map(Number);
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const localHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
      const localMinute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
      const currentMinutes = localHour * 60 + localMinute;
      const endMinutes = endHour * 60 + endMinute;

      if (currentMinutes < endMinutes) {
        return; // Not past working hours yet
      }
    } catch {
      // If config load fails, skip daily summary rather than crash
      return;
    }

    const status = this.getStatus();
    const blocks = formatDailySummary(status);
    await this.slackService.sendDirectMessage(blocks);
    this.dailySummarySent = true;
    this.dailySummaryDate = today;
    logger.info('Daily summary sent');
  }

  // ---- Critical error -------------------------------------------

  private async handleCriticalError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    // Only notify on auth-related errors
    const isCritical =
      message.includes('scope not granted') ||
      message.includes('UNAUTHENTICATED') ||
      message.includes('invalid_grant');

    if (!isCritical) return;

    const criticalError: CriticalPipelineError = {
      type: message.includes('scope not granted') || message.includes('invalid_grant')
        ? 'google_auth'
        : 'slack_auth',
      message,
      timestamp: new Date().toISOString(),
    };

    const blocks = formatCriticalError(criticalError);

    try {
      await this.slackService.sendDirectMessage(blocks);
      logger.info({ type: criticalError.type }, `Critical error notification sent: ${criticalError.type}`);
    } catch {
      // Slack itself may be down if it's a Slack auth error
      logger.error('Failed to send critical error notification — Slack may be unavailable');
    }
  }

  // ---- Helpers --------------------------------------------------

  private ensureMeetingMetadata(event: CalendarEvent): void {
    const meeting = this.stateStore.getMeeting(event.id);
    if (!meeting || !meeting.title) {
      const state = this.stateStore.getState();
      if (state.meetings[event.id]) {
        state.meetings[event.id].title = event.title;
        state.meetings[event.id].startTime = event.start;
        state.meetings[event.id].endTime = event.end;
        if (event.recurringEventId) {
          state.meetings[event.id].recurringEventId = event.recurringEventId;
        }
      }
    }
  }

  private incrementMetric(
    metric: 'briefingsSent' | 'postMeetingProcessed' | 'actionItemsCreated' | 'errors',
    value: number = 1
  ): void {
    const state = this.stateStore.getState();
    const today = new Date().toISOString().split('T')[0];

    if (!state.dailyMetrics[today]) {
      state.dailyMetrics[today] = {
        briefingsSent: 0,
        postMeetingProcessed: 0,
        actionItemsCreated: 0,
        errors: 0,
      };
    }

    state.dailyMetrics[today][metric] += value;
    this.stateStore.save();
  }
}
