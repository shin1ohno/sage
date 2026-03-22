/**
 * Pipeline Scheduler
 *
 * Orchestrates the meeting intelligence pipeline by scheduling
 * briefing generation and post-meeting processing based on calendar events.
 */

import type { CalendarSourceManager } from '../integrations/calendar-source-manager.js';
import type { BriefingGenerator } from './briefing-generator.js';
import type { PostMeetingProcessor } from './post-meeting-processor.js';
import type { PipelineStateStore } from './pipeline-state-store.js';
import type { WorkingCadenceService } from './working-cadence.js';
import type { SlackService } from '../integrations/slack-service.js';
import type { MeetingIntelligenceConfig } from '../types/pipeline-config.js';

export class PipelineScheduler {
  readonly calendarSourceManager: CalendarSourceManager;
  readonly briefingGenerator: BriefingGenerator;
  readonly postMeetingProcessor: PostMeetingProcessor;
  readonly stateStore: PipelineStateStore;
  readonly workingCadenceService: WorkingCadenceService;
  readonly slackService: SlackService;
  readonly config: MeetingIntelligenceConfig;
  private running = false;

  constructor(
    calendarSourceManager: CalendarSourceManager,
    briefingGenerator: BriefingGenerator,
    postMeetingProcessor: PostMeetingProcessor,
    stateStore: PipelineStateStore,
    workingCadenceService: WorkingCadenceService,
    slackService: SlackService,
    config: MeetingIntelligenceConfig
  ) {
    this.calendarSourceManager = calendarSourceManager;
    this.briefingGenerator = briefingGenerator;
    this.postMeetingProcessor = postMeetingProcessor;
    this.stateStore = stateStore;
    this.workingCadenceService = workingCadenceService;
    this.slackService = slackService;
    this.config = config;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
