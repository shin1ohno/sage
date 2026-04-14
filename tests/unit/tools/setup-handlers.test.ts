/**
 * Setup Handlers Unit Tests
 *
 * Tests for setup-related tool handlers using dependency injection
 * via Context objects.
 */

import {
  handleCheckSetupStatus,
  handleStartSetupWizard,
  handleAnswerWizardQuestion,
  handleSaveConfig,
} from '../../../src/tools/setup/handlers.js';
import { ConfigLoader } from '../../../src/config/loader.js';
import {
  createMockSetupContext,
  DEFAULT_TEST_CONFIG,
} from '../../helpers/index.js';

// Mock ConfigLoader
jest.mock('../../../src/config/loader.js', () => ({
  ConfigLoader: {
    exists: jest.fn(),
    getConfigPath: jest.fn().mockReturnValue('/mock/path/.sage/config.json'),
  },
}));

describe('Setup Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCheckSetupStatus', () => {
    it('should return setupComplete false when config file does not exist', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(false);

      const ctx = createMockSetupContext({
        config: null,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.setupComplete).toBe(false);
      expect(response.configExists).toBe(false);
    });

    it('should return setupComplete false when config file exists but config is null', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(true);

      const ctx = createMockSetupContext({
        config: null,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.setupComplete).toBe(false);
      expect(response.configExists).toBe(true);
    });

    it('should return setupComplete true with user info and integrations when config is valid', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(true);

      const ctx = createMockSetupContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.setupComplete).toBe(true);
      expect(response.configExists).toBe(true);
      expect(response.user).toBeDefined();
      expect(response.user.name).toBe(DEFAULT_TEST_CONFIG.user.name);
      expect(response.user.timezone).toBe(DEFAULT_TEST_CONFIG.user.timezone);
      expect(response.integrations).toBeDefined();
      expect(response.suggestions).toBeInstanceOf(Array);
    });

    it('should include integration status in response', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(true);

      const ctx = createMockSetupContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.integrations).toHaveProperty('eventKit');
      expect(response.integrations).toHaveProperty('googleCalendar');
      expect(response.integrations).toHaveProperty('appleReminders');
      expect(response.integrations).toHaveProperty('notion');
      expect(response.integrations).toHaveProperty('slack');
    });

    it('should reflect process.platform for macOS-dependent integrations', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(true);

      const ctx = createMockSetupContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      const isMacOS = process.platform === 'darwin';
      expect(response.integrations.eventKit.available).toBe(isMacOS);
      expect(response.integrations.appleReminders.available).toBe(isMacOS);
    });

    it('should call getConfig from context', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(true);

      const getConfigMock = jest.fn().mockReturnValue(DEFAULT_TEST_CONFIG);
      const ctx = createMockSetupContext({
        getConfig: getConfigMock,
      });

      await handleCheckSetupStatus(ctx);

      expect(getConfigMock).toHaveBeenCalled();
    });
  });

  describe('handleStartSetupWizard', () => {
    it('should return deprecated response regardless of arguments', async () => {
      const ctx = createMockSetupContext();

      const result = await handleStartSetupWizard(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.deprecated).toBe(true);
      expect(response.alternative).toBe('update_config');
      expect(response.message).toBeDefined();
    });

    it('should return deprecated response even with quick mode', async () => {
      const ctx = createMockSetupContext();

      const result = await handleStartSetupWizard(ctx, { mode: 'quick' });
      const response = JSON.parse(result.content[0].text);

      expect(response.deprecated).toBe(true);
      expect(response.alternative).toBe('update_config');
    });
  });

  describe('handleAnswerWizardQuestion', () => {
    it('should return deprecated response', async () => {
      const ctx = createMockSetupContext();

      const result = await handleAnswerWizardQuestion(ctx, {
        questionId: 'user_name',
        answer: 'Test User',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.deprecated).toBe(true);
      expect(response.alternative).toBe('update_config');
      expect(response.message).toBeDefined();
    });
  });

  describe('handleSaveConfig', () => {
    it('should return deprecated response when confirm is true', async () => {
      const ctx = createMockSetupContext();

      const result = await handleSaveConfig(ctx, { confirm: true });
      const response = JSON.parse(result.content[0].text);

      expect(response.deprecated).toBe(true);
      expect(response.alternative).toBe('update_config');
      expect(response.message).toBeDefined();
    });

    it('should return deprecated response when confirm is false', async () => {
      const ctx = createMockSetupContext();

      const result = await handleSaveConfig(ctx, { confirm: false });
      const response = JSON.parse(result.content[0].text);

      expect(response.deprecated).toBe(true);
      expect(response.alternative).toBe('update_config');
    });
  });
});
