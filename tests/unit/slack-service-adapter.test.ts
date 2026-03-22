/**
 * SlackServiceAdapter Unit Tests
 */

import { SlackServiceAdapter, createSlackService } from '../../src/services/reloadable/slack-service-adapter.js';
import { SlackService } from '../../src/integrations/slack-service.js';
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

// Mock SlackOAuthHandler
jest.mock('../../src/oauth/slack-oauth-handler.js', () => ({
  SlackOAuthHandler: jest.fn().mockImplementation(() => ({})),
}));

// Mock SlackService
jest.mock('../../src/integrations/slack-service.js', () => ({
  SlackService: jest.fn().mockImplementation(() => ({
    getOAuthHandler: jest.fn(),
  })),
}));

function createConfigWithSlack(overrides?: Partial<{ clientId: string; clientSecret: string; redirectUri: string }>): UserConfig {
  return {
    ...DEFAULT_CONFIG,
    integrations: {
      ...DEFAULT_CONFIG.integrations,
      slack: {
        clientId: overrides?.clientId ?? 'test-client-id',
        clientSecret: overrides?.clientSecret ?? 'test-client-secret',
        redirectUri: overrides?.redirectUri,
      },
    },
  };
}

describe('SlackServiceAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('name', () => {
    it('should return SlackService', () => {
      const adapter = new SlackServiceAdapter(createSlackService);
      expect(adapter.name).toBe('SlackService');
    });
  });

  describe('dependsOnSections', () => {
    it('should return integrations', () => {
      const adapter = new SlackServiceAdapter(createSlackService);
      expect(adapter.dependsOnSections).toEqual(['integrations']);
    });
  });

  describe('getInstance', () => {
    it('should return null initially when created with factory', () => {
      const adapter = new SlackServiceAdapter(createSlackService);
      expect(adapter.getInstance()).toBeNull();
    });

    it('should return the instance when created with existing instance', () => {
      const mockInstance = new SlackService({} as never);
      const adapter = new SlackServiceAdapter(mockInstance);
      expect(adapter.getInstance()).toBe(mockInstance);
    });
  });

  describe('reinitialize', () => {
    it('should call factory and set instance when Slack is configured', async () => {
      const mockInstance = {} as SlackService;
      const factory = jest.fn().mockReturnValue(mockInstance);
      const adapter = new SlackServiceAdapter(factory);

      const config = createConfigWithSlack();
      await adapter.reinitialize(config);

      expect(factory).toHaveBeenCalledWith(config);
      expect(adapter.getInstance()).toBe(mockInstance);
    });

    it('should set instance to null without throwing when Slack is not configured', async () => {
      const adapter = new SlackServiceAdapter(createSlackService);

      // DEFAULT_CONFIG has no slack config
      await adapter.reinitialize(DEFAULT_CONFIG);

      expect(adapter.getInstance()).toBeNull();
    });

    it('should set instance to null when factory throws', async () => {
      const factory = jest.fn().mockImplementation(() => {
        throw new Error('missing config');
      });
      const adapter = new SlackServiceAdapter(factory);

      await adapter.reinitialize(DEFAULT_CONFIG);

      expect(adapter.getInstance()).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should set instance to null', async () => {
      const mockInstance = new SlackService({} as never);
      const adapter = new SlackServiceAdapter(mockInstance);

      expect(adapter.getInstance()).toBe(mockInstance);

      await adapter.shutdown();

      expect(adapter.getInstance()).toBeNull();
    });
  });

  describe('createSlackService', () => {
    it('should throw when slack config is missing', () => {
      expect(() => createSlackService(DEFAULT_CONFIG)).toThrow(
        'Slack integration not configured: missing clientId or clientSecret'
      );
    });

    it('should create SlackService when slack config is present', () => {
      const config = createConfigWithSlack();
      const service = createSlackService(config);
      expect(service).toBeDefined();
      expect(SlackService).toHaveBeenCalled();
    });
  });
});
