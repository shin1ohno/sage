/**
 * Reloadable Service Adapter for PipelineScheduler
 *
 * Wraps PipelineScheduler to support hot-reload functionality.
 * Reinitializes the service when meetingIntelligence config changes.
 * Requires external dependency injection via setDependencies() before reinitialize.
 */

import type { ReloadableService } from '../../types/hot-reload.js';
import type { UserConfig } from '../../types/config.js';
import {
  PipelineScheduler,
  type CalendarSourceManagerDep,
  type BriefingGeneratorDep,
  type PostMeetingProcessorDep,
  type PipelineStateStoreDep,
  type SlackServiceDep,
} from '../pipeline-scheduler.js';
import { MeetingIntelligenceConfigSchema } from '../../types/pipeline-config.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PipelineSchedulerAdapter');

export interface PipelineSchedulerDeps {
  calendarSourceManager: CalendarSourceManagerDep;
  briefingGenerator: BriefingGeneratorDep;
  postMeetingProcessor: PostMeetingProcessorDep;
  stateStore: PipelineStateStoreDep;
  slackService: SlackServiceDep;
}

export type PipelineSchedulerFactory = (
  config: UserConfig,
  deps: PipelineSchedulerDeps
) => PipelineScheduler;

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
    {},
    deps.slackService,
    miConfig
  );
}

export class PipelineSchedulerAdapter implements ReloadableService {
  readonly name = 'PipelineScheduler';
  readonly dependsOnSections: readonly string[] = ['meetingIntelligence'];

  private instance: PipelineScheduler | null = null;
  private factory: PipelineSchedulerFactory;
  private deps: Partial<PipelineSchedulerDeps> = {};

  constructor(factoryOrInstance: PipelineSchedulerFactory | PipelineScheduler) {
    if (typeof factoryOrInstance === 'function') {
      this.factory = factoryOrInstance;
    } else {
      this.instance = factoryOrInstance;
      this.factory = createPipelineScheduler;
    }
  }

  setDependencies(deps: Partial<PipelineSchedulerDeps>): void {
    Object.assign(this.deps, deps);
  }

  getInstance(): PipelineScheduler | null {
    return this.instance;
  }

  async shutdown(): Promise<void> {
    if (this.instance) {
      await this.instance.stop();
    }
    this.instance = null;
  }

  async reinitialize(config: UserConfig): Promise<void> {
    logger.info('Reinitializing PipelineScheduler with new config');

    if (config.meetingIntelligence?.enabled !== true) {
      this.instance = null;
      return;
    }

    const { calendarSourceManager, briefingGenerator, postMeetingProcessor, stateStore, slackService } = this.deps;
    if (!calendarSourceManager || !briefingGenerator || !postMeetingProcessor || !stateStore || !slackService) {
      logger.warn('PipelineScheduler dependencies not set, skipping initialization');
      this.instance = null;
      return;
    }

    try {
      this.instance = this.factory(config, {
        calendarSourceManager,
        briefingGenerator,
        postMeetingProcessor,
        stateStore,
        slackService,
      });
      await this.instance.start();
    } catch (error) {
      logger.error({ err: error }, 'Failed to reinitialize PipelineScheduler');
      throw error;
    }
  }
}
