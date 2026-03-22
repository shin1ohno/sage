/**
 * PipelineStateStoreAdapter Unit Tests
 */

import { PipelineStateStoreAdapter, createPipelineStateStore } from '../../src/services/reloadable/pipeline-state-store-adapter.js';
import { PipelineStateStore } from '../../src/services/pipeline-state-store.js';
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

function createMockStateStore(): jest.Mocked<PipelineStateStore> {
  return {
    load: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PipelineStateStore>;
}

describe('PipelineStateStoreAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('name', () => {
    it('should return PipelineStateStore', () => {
      const adapter = new PipelineStateStoreAdapter(createPipelineStateStore);
      expect(adapter.name).toBe('PipelineStateStore');
    });
  });

  describe('dependsOnSections', () => {
    it('should return meetingIntelligence', () => {
      const adapter = new PipelineStateStoreAdapter(createPipelineStateStore);
      expect(adapter.dependsOnSections).toEqual(['meetingIntelligence']);
    });
  });

  describe('getInstance', () => {
    it('should return null initially when created with factory', () => {
      const adapter = new PipelineStateStoreAdapter(createPipelineStateStore);
      expect(adapter.getInstance()).toBeNull();
    });

    it('should return the instance when created with existing instance', () => {
      const mockStore = createMockStateStore();
      const adapter = new PipelineStateStoreAdapter(mockStore);
      expect(adapter.getInstance()).toBe(mockStore);
    });
  });

  describe('reinitialize', () => {
    it('should call factory and then load()', async () => {
      const mockStore = createMockStateStore();
      const factory = jest.fn().mockReturnValue(mockStore);
      const adapter = new PipelineStateStoreAdapter(factory);

      await adapter.reinitialize(DEFAULT_CONFIG);

      expect(factory).toHaveBeenCalledWith(DEFAULT_CONFIG);
      expect(mockStore.load).toHaveBeenCalled();
      expect(adapter.getInstance()).toBe(mockStore);
    });

    it('should throw if factory throws', async () => {
      const factory = jest.fn().mockImplementation(() => {
        throw new Error('factory error');
      });
      const adapter = new PipelineStateStoreAdapter(factory);

      await expect(adapter.reinitialize(DEFAULT_CONFIG)).rejects.toThrow('factory error');
    });

    it('should throw if load() fails', async () => {
      const mockStore = createMockStateStore();
      mockStore.load.mockRejectedValue(new Error('load error'));
      const factory = jest.fn().mockReturnValue(mockStore);
      const adapter = new PipelineStateStoreAdapter(factory);

      await expect(adapter.reinitialize(DEFAULT_CONFIG)).rejects.toThrow('load error');
    });
  });

  describe('shutdown', () => {
    it('should call flush() then set instance to null', async () => {
      const mockStore = createMockStateStore();
      const adapter = new PipelineStateStoreAdapter(mockStore);

      await adapter.shutdown();

      expect(mockStore.flush).toHaveBeenCalled();
      expect(adapter.getInstance()).toBeNull();
    });

    it('should handle flush() errors gracefully', async () => {
      const mockStore = createMockStateStore();
      mockStore.flush.mockRejectedValue(new Error('flush error'));
      const adapter = new PipelineStateStoreAdapter(mockStore);

      await adapter.shutdown();

      expect(mockStore.flush).toHaveBeenCalled();
      expect(adapter.getInstance()).toBeNull();
    });

    it('should handle null instance gracefully', async () => {
      const adapter = new PipelineStateStoreAdapter(createPipelineStateStore);

      await adapter.shutdown();

      expect(adapter.getInstance()).toBeNull();
    });
  });

  describe('createPipelineStateStore', () => {
    it('should create a PipelineStateStore instance', () => {
      const store = createPipelineStateStore(DEFAULT_CONFIG);
      expect(store).toBeInstanceOf(PipelineStateStore);
    });
  });
});
