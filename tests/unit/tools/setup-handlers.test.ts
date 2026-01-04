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
import { SetupWizard } from '../../../src/setup/wizard.js';
import {
  createMockSetupContext,
  DEFAULT_TEST_CONFIG,
} from '../../helpers/index.js';

// Mock ConfigLoader
jest.mock('../../../src/config/loader.js', () => ({
  ConfigLoader: {
    exists: jest.fn(),
    save: jest.fn(),
    getConfigPath: jest.fn().mockReturnValue('/mock/path/.sage/config.json'),
  },
}));

// Mock SetupWizard
jest.mock('../../../src/setup/wizard.js', () => ({
  SetupWizard: {
    createSession: jest.fn(),
    getCurrentQuestion: jest.fn(),
    answerQuestion: jest.fn(),
    buildConfig: jest.fn(),
  },
}));

describe('Setup Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCheckSetupStatus', () => {
    it('should return setup incomplete when config file does not exist', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(false);

      const ctx = createMockSetupContext({
        config: null,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.setupComplete).toBe(false);
      expect(response.configExists).toBe(false);
      expect(response.nextAction).toBe('start_setup_wizard');
    });

    it('should return setup incomplete when config file exists but is invalid', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(true);

      const ctx = createMockSetupContext({
        config: null,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.setupComplete).toBe(false);
      expect(response.configExists).toBe(true);
      expect(response.nextAction).toBe('start_setup_wizard');
    });

    it('should return setup complete when config is valid', async () => {
      (ConfigLoader.exists as jest.Mock).mockResolvedValue(true);

      const ctx = createMockSetupContext({
        config: DEFAULT_TEST_CONFIG,
      });

      const result = await handleCheckSetupStatus(ctx);
      const response = JSON.parse(result.content[0].text);

      expect(response.setupComplete).toBe(true);
      expect(response.configExists).toBe(true);
      expect(response.userName).toBe(DEFAULT_TEST_CONFIG.user.name);
      expect(response.availableTools).toContain('analyze_tasks');
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
    const mockWizardSession = {
      sessionId: 'test-session-123',
      currentStep: 1,
      totalSteps: 5,
      answers: {},
      mode: 'full' as const,
      startedAt: new Date().toISOString(),
    };

    const mockQuestion = {
      id: 'user_name',
      text: 'What is your name?',
      type: 'text',
      defaultValue: '',
      helpText: 'Enter your full name',
    };

    beforeEach(() => {
      (SetupWizard.createSession as jest.Mock).mockReturnValue(mockWizardSession);
      (SetupWizard.getCurrentQuestion as jest.Mock).mockReturnValue(mockQuestion);
    });

    it('should create a wizard session with full mode by default', async () => {
      const ctx = createMockSetupContext();

      await handleStartSetupWizard(ctx, {});

      expect(SetupWizard.createSession).toHaveBeenCalledWith('full');
    });

    it('should create a wizard session with quick mode when specified', async () => {
      const ctx = createMockSetupContext();

      await handleStartSetupWizard(ctx, { mode: 'quick' });

      expect(SetupWizard.createSession).toHaveBeenCalledWith('quick');
    });

    it('should set wizard session in context', async () => {
      const setWizardSessionMock = jest.fn();
      const ctx = createMockSetupContext({
        setWizardSession: setWizardSessionMock,
      });

      await handleStartSetupWizard(ctx, {});

      expect(setWizardSessionMock).toHaveBeenCalledWith(mockWizardSession);
    });

    it('should return session info and first question', async () => {
      const ctx = createMockSetupContext();

      const result = await handleStartSetupWizard(ctx, {});
      const response = JSON.parse(result.content[0].text);

      expect(response.sessionId).toBe(mockWizardSession.sessionId);
      expect(response.currentStep).toBe(1);
      expect(response.totalSteps).toBe(5);
      expect(response.progress).toBe(20);
      expect(response.question.id).toBe('user_name');
    });
  });

  describe('handleAnswerWizardQuestion', () => {
    const mockWizardSession = {
      sessionId: 'test-session-123',
      currentStep: 2,
      totalSteps: 5,
      answers: { user_name: 'Test User' },
      mode: 'full' as const,
      startedAt: new Date().toISOString(),
    };

    it('should return error when no wizard session exists', async () => {
      const ctx = createMockSetupContext({
        wizardSession: null,
      });

      const result = await handleAnswerWizardQuestion(ctx, {
        questionId: 'user_name',
        answer: 'Test User',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('セットアップセッション');
    });

    it('should process answer and return next question', async () => {
      const nextQuestion = {
        id: 'timezone',
        text: 'What is your timezone?',
        type: 'select',
        options: ['Asia/Tokyo', 'UTC'],
      };

      (SetupWizard.answerQuestion as jest.Mock).mockReturnValue({
        success: true,
        isComplete: false,
      });
      (SetupWizard.getCurrentQuestion as jest.Mock).mockReturnValue(nextQuestion);

      const ctx = createMockSetupContext({
        wizardSession: mockWizardSession,
      });

      const result = await handleAnswerWizardQuestion(ctx, {
        questionId: 'user_name',
        answer: 'Test User',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.question.id).toBe('timezone');
    });

    it('should return completion when wizard is done', async () => {
      (SetupWizard.answerQuestion as jest.Mock).mockReturnValue({
        success: true,
        isComplete: true,
      });

      const ctx = createMockSetupContext({
        wizardSession: mockWizardSession,
      });

      const result = await handleAnswerWizardQuestion(ctx, {
        questionId: 'final_question',
        answer: 'done',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.isComplete).toBe(true);
      expect(response.nextAction).toBe('save_config');
    });

    it('should return error when answer is invalid', async () => {
      (SetupWizard.answerQuestion as jest.Mock).mockReturnValue({
        success: false,
        error: 'Invalid answer format',
        currentQuestion: { id: 'user_name' },
      });

      const ctx = createMockSetupContext({
        wizardSession: mockWizardSession,
      });

      const result = await handleAnswerWizardQuestion(ctx, {
        questionId: 'user_name',
        answer: '',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toBe('Invalid answer format');
    });
  });

  describe('handleSaveConfig', () => {
    const mockWizardSession = {
      sessionId: 'test-session-123',
      currentStep: 5,
      totalSteps: 5,
      answers: {
        user_name: 'Test User',
        timezone: 'Asia/Tokyo',
      },
      mode: 'full' as const,
      startedAt: new Date().toISOString(),
    };

    it('should return cancelled when confirm is false', async () => {
      const ctx = createMockSetupContext({
        wizardSession: mockWizardSession,
      });

      const result = await handleSaveConfig(ctx, { confirm: false });
      const response = JSON.parse(result.content[0].text);

      expect(response.saved).toBe(false);
      expect(response.message).toContain('キャンセル');
    });

    it('should return error when no wizard session exists', async () => {
      const ctx = createMockSetupContext({
        wizardSession: null,
      });

      const result = await handleSaveConfig(ctx, { confirm: true });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
    });

    it('should save config and clear wizard session on success', async () => {
      const newConfig = {
        ...DEFAULT_TEST_CONFIG,
        user: { ...DEFAULT_TEST_CONFIG.user, name: 'New User' },
      };

      (SetupWizard.buildConfig as jest.Mock).mockReturnValue(newConfig);
      (ConfigLoader.save as jest.Mock).mockResolvedValue(undefined);

      const setConfigMock = jest.fn();
      const setWizardSessionMock = jest.fn();
      const initializeServicesMock = jest.fn();

      const ctx = createMockSetupContext({
        wizardSession: mockWizardSession,
        setConfig: setConfigMock,
        setWizardSession: setWizardSessionMock,
        initializeServices: initializeServicesMock,
      });

      const result = await handleSaveConfig(ctx, { confirm: true });
      const response = JSON.parse(result.content[0].text);

      expect(response.saved).toBe(true);
      expect(response.userName).toBe('New User');
      expect(ConfigLoader.save).toHaveBeenCalledWith(newConfig);
      expect(setConfigMock).toHaveBeenCalledWith(newConfig);
      expect(setWizardSessionMock).toHaveBeenCalledWith(null);
      expect(initializeServicesMock).toHaveBeenCalledWith(newConfig);
    });

    it('should handle save errors gracefully', async () => {
      (SetupWizard.buildConfig as jest.Mock).mockReturnValue(DEFAULT_TEST_CONFIG);
      (ConfigLoader.save as jest.Mock).mockRejectedValue(new Error('Disk full'));

      const ctx = createMockSetupContext({
        wizardSession: mockWizardSession,
      });

      const result = await handleSaveConfig(ctx, { confirm: true });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe(true);
      expect(response.message).toContain('設定の保存に失敗しました');
    });
  });
});
