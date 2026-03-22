/**
 * Reloadable Service Adapter for PipelineScheduler
 *
 * Wraps PipelineScheduler to support hot-reload functionality.
 * Reinitializes the service when meetingIntelligence config changes.
 * Requires external dependency injection via setDependencies() before reinitialize.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import { PipelineScheduler } from '../pipeline-scheduler.js';
import type { CalendarSourceManager } from '../../integrations/calendar-source-manager.js';
import type { BriefingGenerator } from '../briefing-generator.js';
import type { PostMeetingProcessor } from '../post-meeting-processor.js';
import type { PipelineStateStore } from '../pipeline-state-store.js';
import type { WorkingCadenceService } from '../working-cadence.js';
import type { SlackService } from '../../integrations/slack-service.js';
import { MeetingIntelligenceConfigSchema } from '../../types/pipeline-config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PipelineSchedulerAdapter');

/**
 * Dependencies required by PipelineScheduler
 */
export interface PipelineSchedulerDeps {
  calendarSourceManager: CalendarSourceManager;
  briefingGenerator: BriefingGenerator;
  postMeetingProcessor: PostMeetingProcessor;
  stateStore: PipelineStateStore;
  workingCadenceService: WorkingCadenceService;
  slackService: SlackService;
}

/**
 * Factory function type for creating PipelineScheduler
 */
export type PipelineSchedulerFactory = (
  config: UserConfig,
  deps: PipelineSchedulerDeps
) => PipelineScheduler;

/**
 * Default factory that creates PipelineScheduler
 */
export function createPipelineScheduler(
  config: UserConfig,
  deps: PipelineSchedulerDeps
): PipelineScheduler {
  const miConfig = MeetingIntelligenceConfigSchema.parse(config.meetingIntelligence ?? {});
  return new PipelineScheduler(
    deps.calendarSourceManager,
    deps.briefingGenerator,
    deps.postMeetingProcessor,
    deps.stateStore,
    deps.workingCadenceService,
    deps.slackService,
    miConfig
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
  private workingCadenceService?: WorkingCadenceService;
  private slackService?: SlackService;

  /**
   * Constructor
   * @param factoryOrInstance - Either a factory function or an existing instance
   */
  constructor(factoryOrInstance: PipelineSchedulerFactory | PipelineScheduler) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createPipelineScheduler;
    }
  }

  /**
   * Set dependencies for PipelineScheduler creation
   */
  setDependencies(deps: {
    calendarSourceManager?: CalendarSourceManager;
    briefingGenerator?: BriefingGenerator;
    postMeetingProcessor?: PostMeetingProcessor;
    stateStore?: PipelineStateStore;
    workingCadenceService?: WorkingCadenceService;
    slackService?: SlackService;
  }): void {
    this.calendarSourceManager = deps.calendarSourceManager;
    this.briefingGenerator = deps.briefingGenerator;
    this.postMeetingProcessor = deps.postMeetingProcessor;
    this.stateStore = deps.stateStore;
    this.workingCadenceService = deps.workingCadenceService;
    this.slackService = deps.slackService;
  }

  /**
   * Get the current PipelineScheduler instance
   */
  getInstance(): PipelineScheduler | null {
    return this.instance;
  }

  /**
   * Shutdown the current instance
   * Stops the scheduler to clear timers before clearing the reference
   */
  async shutdown(): Promise<void> {
    logger.debug('Shutting down PipelineScheduler');

    if (this.instance) {
      await this.instance.stop();
      logger.debug('PipelineScheduler stopped');
    }

    this.instance = null;
  }

  /**
   * Reinitialize with new configuration
   * Requires dependencies to be set via setDependencies() first.
   * If pipeline is not enabled or dependencies are missing, sets instance to null.
   */
  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing PipelineScheduler with new config');

    if (config.meetingIntelligence?.enabled !== true) {
      logger.warn('Meeting intelligence pipeline not enabled, skipping PipelineScheduler');
      this.instance = null;
      return;
    }

    if (
      !this.calendarSourceManager ||
      !this.briefingGenerator ||
      !this.postMeetingProcessor ||
      !this.stateStore ||
      !this.workingCadenceService ||
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
        workingCadenceService: this.workingCadenceService,
        slackService: this.slackService,
      });
      await this.instance.start();
      logger.info('PipelineScheduler reinitialized and started successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize PipelineScheduler');
      throw error;
    }
  }
}
