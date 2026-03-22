/**
 * PipelineSchedulerAdapter Unit Tests
 */

import { PipelineSchedulerAdapter, createPipelineScheduler } from '../../src/services/reloadable/pipeline-scheduler-adapter.js';
import type { PipelineScheduler } from '../../src/services/pipeline-scheduler.js';
import type { CalendarSourceManager } from '../../src/integrations/calendar-source-manager.js';
import type { BriefingGenerator } from '../../src/services/briefing-generator.js';
import type { PostMeetingProcessor } from '../../src/services/post-meeting-processor.js';
import type { PipelineStateStore } from '../../src/services/pipeline-state-store.js';
import type { WorkingCadenceService } from '../../src/services/working-cadence.js';
import type { SlackService } from '../../src/integrations/slack-service.js';
import type { UserConfig } from '../../src/types/config.js';
import { DEFAULT_CONFIG } from '../../src/types/config.js';

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

function createMockScheduler(): jest.Mocked<PipelineScheduler> {
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<PipelineScheduler>;
}

function createMockDependencies() {
  return {
    calendarSourceManager: {} as CalendarSourceManager,
    briefingGenerator: {} as BriefingGenerator,
    postMeetingProcessor: {} as PostMeetingProcessor,
    stateStore: {} as PipelineStateStore,
    slackService: {} as SlackService,
  };
}

function createEnabledConfig(): UserConfig {
  return {
    ...DEFAULT_CONFIG,
    meetingIntelligence: {
      enabled: true,
    },
  };
}

describe('PipelineSchedulerAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('name', () => {
    it('should return PipelineScheduler', () => {
      const factory = jest.fn();
      const adapter = new PipelineSchedulerAdapter(factory);
      expect(adapter.name).toBe('PipelineScheduler');
    });
  });

  describe('dependsOnSections', () => {
    it('should return meetingIntelligence', () => {
      const factory = jest.fn();
      const adapter = new PipelineSchedulerAdapter(factory);
      expect(adapter.dependsOnSections).toEqual(['meetingIntelligence']);
    });
  });

  describe('getInstance', () => {
    it('should return null initially when created with factory', () => {
      const factory = jest.fn();
      const adapter = new PipelineSchedulerAdapter(factory);
      expect(adapter.getInstance()).toBeNull();
    });

    it('should return the instance when created with existing instance', () => {
      const mockScheduler = createMockScheduler();
      const adapter = new PipelineSchedulerAdapter(mockScheduler);
      expect(adapter.getInstance()).toBe(mockScheduler);
    });
  });

  describe('shutdown', () => {
    it('should call stop() on existing instance', async () => {
      const mockScheduler = createMockScheduler();
      const adapter = new PipelineSchedulerAdapter(mockScheduler);

      await adapter.shutdown();

      expect(mockScheduler.stop).toHaveBeenCalled();
      expect(adapter.getInstance()).toBeNull();
    });

    it('should handle null instance gracefully', async () => {
      const factory = jest.fn();
      const adapter = new PipelineSchedulerAdapter(factory);

      await adapter.shutdown();

      expect(adapter.getInstance()).toBeNull();
    });
  });

  describe('setDependencies', () => {
    it('should set dependencies correctly', async () => {
      const mockScheduler = createMockScheduler();
      const factory = jest.fn().mockReturnValue(mockScheduler);
      const adapter = new PipelineSchedulerAdapter(factory);
      const deps = createMockDependencies();

      adapter.setDependencies(deps);

      const config = createEnabledConfig();
      await adapter.reinitialize(config);

      expect(factory).toHaveBeenCalledWith(config, deps);
    });
  });

  describe('reinitialize', () => {
    it('should set instance to null when pipeline is not enabled', async () => {
      const factory = jest.fn();
      const adapter = new PipelineSchedulerAdapter(factory);
      adapter.setDependencies(createMockDependencies());

      await adapter.reinitialize(DEFAULT_CONFIG);

      expect(adapter.getInstance()).toBeNull();
      expect(factory).not.toHaveBeenCalled();
    });

    it('should set instance to null when meetingIntelligence.enabled is false', async () => {
      const factory = jest.fn();
      const adapter = new PipelineSchedulerAdapter(factory);
      adapter.setDependencies(createMockDependencies());

      const config: UserConfig = {
        ...DEFAULT_CONFIG,
        meetingIntelligence: { enabled: false },
      };
      await adapter.reinitialize(config);

      expect(adapter.getInstance()).toBeNull();
      expect(factory).not.toHaveBeenCalled();
    });

    it('should set instance to null when dependencies are missing', async () => {
      const factory = jest.fn();
      const adapter = new PipelineSchedulerAdapter(factory);
      // No setDependencies call

      const config = createEnabledConfig();
      await adapter.reinitialize(config);

      expect(adapter.getInstance()).toBeNull();
      expect(factory).not.toHaveBeenCalled();
    });

    it('should create instance and call start() when pipeline is enabled and deps are set', async () => {
      const mockScheduler = createMockScheduler();
      const factory = jest.fn().mockReturnValue(mockScheduler);
      const adapter = new PipelineSchedulerAdapter(factory);
      adapter.setDependencies(createMockDependencies());

      const config = createEnabledConfig();
      await adapter.reinitialize(config);

      expect(factory).toHaveBeenCalled();
      expect(mockScheduler.start).toHaveBeenCalled();
      expect(adapter.getInstance()).toBe(mockScheduler);
    });

    it('should throw if factory throws', async () => {
      const factory = jest.fn().mockImplementation(() => {
        throw new Error('factory error');
      });
      const adapter = new PipelineSchedulerAdapter(factory);
      adapter.setDependencies(createMockDependencies());

      const config = createEnabledConfig();
      await expect(adapter.reinitialize(config)).rejects.toThrow('factory error');
    });

    it('should throw if start() fails', async () => {
      const mockScheduler = createMockScheduler();
      mockScheduler.start.mockRejectedValue(new Error('start error'));
      const factory = jest.fn().mockReturnValue(mockScheduler);
      const adapter = new PipelineSchedulerAdapter(factory);
      adapter.setDependencies(createMockDependencies());

      const config = createEnabledConfig();
      await expect(adapter.reinitialize(config)).rejects.toThrow('start error');
    });
  });
});
