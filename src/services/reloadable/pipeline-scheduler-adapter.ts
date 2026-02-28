/**
 * Reloadable Service Adapter for PipelineScheduler
 *
 * Wraps PipelineScheduler to support hot-reload functionality.
 * Reinitializes the service when meetingIntelligence config changes.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { PipelineScheduler } from '../pipeline-scheduler.js';
import type { CalendarSourceManager } from '../../integrations/calendar-source-manager.js';
import type { BriefingGenerator } from '../briefing-generator.js';
import type { PostMeetingProcessor } from '../post-meeting-processor.js';
import type { PipelineStateStore } from '../pipeline-state-store.js';
import type { SlackService } from '../../integrations/slack-service.js';
import { MeetingIntelligenceConfigSchema } from '../../types/pipeline-config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PipelineSchedulerAdapter');

interface PipelineSchedulerDeps {
  calendarSourceManager: CalendarSourceManager;
  briefingGenerator: BriefingGenerator;
  postMeetingProcessor: PostMeetingProcessor;
  stateStore: PipelineStateStore;
  slackService: SlackService;
}

/**
 * Factory function type for creating PipelineScheduler
 */
export type PipelineSchedulerFactory = (
  config: UserConfig,
  deps: PipelineSchedulerDeps,
) => PipelineScheduler;

/**
 * Default factory that creates PipelineScheduler
 */
export function createPipelineScheduler(
  config: UserConfig,
  deps: PipelineSchedulerDeps,
): PipelineScheduler {
  const miConfig = MeetingIntelligenceConfigSchema.parse(config.meetingIntelligence ?? {});
  return new PipelineScheduler(
    deps.calendarSourceManager,
    deps.briefingGenerator,
    deps.postMeetingProcessor,
    deps.stateStore,
    deps.slackService,
    miConfig,
    config.calendar.workingHours.end,
  );
}

/**
 * Reloadable adapter for PipelineScheduler
 */
export class PipelineSchedulerAdapter implements ReloadableService {
  readonly name = 'PipelineScheduler';
  readonly dependsOnSections: readonly string[] = ['meetingIntelligence'];

  private instance: PipelineScheduler | null = null;
  private factory: PipelineSchedulerFactory;

  private calendarSourceManager?: CalendarSourceManager;
  private briefingGenerator?: BriefingGenerator;
  private postMeetingProcessor?: PostMeetingProcessor;
  private stateStore?: PipelineStateStore;
  private slackService?: SlackService;

  constructor(factoryOrInstance: PipelineSchedulerFactory | PipelineScheduler) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createPipelineScheduler;
    }
  }

  setDependencies(deps: {
    calendarSourceManager?: CalendarSourceManager;
    briefingGenerator?: BriefingGenerator;
    postMeetingProcessor?: PostMeetingProcessor;
    stateStore?: PipelineStateStore;
    slackService?: SlackService;
  }): void {
    if (deps.calendarSourceManager) this.calendarSourceManager = deps.calendarSourceManager;
    if (deps.briefingGenerator) this.briefingGenerator = deps.briefingGenerator;
    if (deps.postMeetingProcessor) this.postMeetingProcessor = deps.postMeetingProcessor;
    if (deps.stateStore) this.stateStore = deps.stateStore;
    if (deps.slackService) this.slackService = deps.slackService;
  }

  getInstance(): PipelineScheduler | null {
    return this.instance;
  }

  async shutdown(): Promise<void> {
    logger.debug('Shutting down PipelineScheduler');
    if (this.instance) {
      await this.instance.stop();
    }
    this.instance = null;
  }

  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing PipelineScheduler with new config');

    if (config.meetingIntelligence?.enabled !== true) {
      logger.warn('Meeting intelligence not enabled, skipping PipelineScheduler initialization');
      this.instance = null;
      return;
    }

    if (
      !this.calendarSourceManager ||
      !this.briefingGenerator ||
      !this.postMeetingProcessor ||
      !this.stateStore ||
      !this.slackService
    ) {
      logger.warn('PipelineScheduler dependencies not set, skipping initialization');
      this.instance = null;
      return;
    }

    try {
      this.instance = this.factory(config, {
        calendarSourceManager: this.calendarSourceManager,
        briefingGenerator: this.briefingGenerator,
        postMeetingProcessor: this.postMeetingProcessor,
        stateStore: this.stateStore,
        slackService: this.slackService,
      });
      await this.instance.start();
      logger.info('PipelineScheduler reinitialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize PipelineScheduler');
      this.instance = null;
    }
  }
}
