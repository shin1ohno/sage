/**
 * Setup Tool Handlers
 *
 * Business logic for setup-related MCP tools.
 * These handlers are decoupled from the MCP server registration
 * to allow reuse between index.ts and mcp-handler.ts.
 *
 * Requirements: 1.1-1.6
 */

import { ConfigLoader } from '../../config/loader.js';
import { SetupWizard } from '../../setup/wizard.js';
import type { UserConfig } from '../../types/index.js';
import { createToolResponse, createErrorFromCatch } from '../registry.js';

/**
 * Wizard session type (from SetupWizard)
 */
export type WizardSession = ReturnType<typeof SetupWizard.createSession>;

/**
 * Setup context containing shared state
 */
export interface SetupContext {
  getConfig: () => UserConfig | null;
  setConfig: (config: UserConfig) => void;
  getWizardSession: () => WizardSession | null;
  setWizardSession: (session: WizardSession | null) => void;
  initializeServices: (config: UserConfig) => void;
}

/**
 * check_setup_status handler
 *
 * Checks if sage has been configured and returns guidance.
 * Requirement: 1.1, 1.2
 */
export async function handleCheckSetupStatus(ctx: SetupContext) {
  const exists = await ConfigLoader.exists();
  const config = ctx.getConfig();
  const isValid = config !== null;

  if (!exists) {
    return createToolResponse({
      setupComplete: false,
      configExists: false,
      message:
        'sageの初期設定が必要です。start_setup_wizardを実行してセットアップを開始してください。',
      nextAction: 'start_setup_wizard',
    });
  }

  if (!isValid) {
    return createToolResponse({
      setupComplete: false,
      configExists: true,
      message:
        '設定ファイルが見つかりましたが、読み込みに失敗しました。設定を再作成してください。',
      nextAction: 'start_setup_wizard',
    });
  }

  return createToolResponse({
    setupComplete: true,
    configExists: true,
    userName: config?.user.name,
    message: 'sageは設定済みです。タスク分析やリマインド設定を開始できます。',
    availableTools: [
      'analyze_tasks',
      'set_reminder',
      'find_available_slots',
      'sync_to_notion',
      'update_config',
    ],
  });
}

/**
 * start_setup_wizard handler
 *
 * Begins the interactive setup process.
 * Requirement: 1.3
 */
export async function handleStartSetupWizard(
  ctx: SetupContext,
  args: { mode?: 'full' | 'quick' }
) {
  const { mode = 'full' } = args;
  const wizardSession = SetupWizard.createSession(mode);
  ctx.setWizardSession(wizardSession);

  const question = SetupWizard.getCurrentQuestion(wizardSession);

  return createToolResponse({
    sessionId: wizardSession.sessionId,
    currentStep: wizardSession.currentStep,
    totalSteps: wizardSession.totalSteps,
    progress: Math.round(
      (wizardSession.currentStep / wizardSession.totalSteps) * 100
    ),
    question: {
      id: question.id,
      text: question.text,
      type: question.type,
      options: question.options,
      defaultValue: question.defaultValue,
      helpText: question.helpText,
    },
    message: 'セットアップを開始します。以下の質問に回答してください。',
  });
}

/**
 * answer_wizard_question handler
 *
 * Answers a setup wizard question and returns next question.
 * Requirement: 1.3, 1.4
 */
export async function handleAnswerWizardQuestion(
  ctx: SetupContext,
  args: { questionId: string; answer: string | string[] }
) {
  const { questionId, answer } = args;
  const wizardSession = ctx.getWizardSession();

  if (!wizardSession) {
    return createToolResponse({
      error: true,
      message:
        'セットアップセッションが見つかりません。start_setup_wizardを実行してください。',
    });
  }

  const result = SetupWizard.answerQuestion(wizardSession, questionId, answer);

  if (!result.success) {
    return createToolResponse({
      error: true,
      message: result.error,
      currentQuestion: result.currentQuestion,
    });
  }

  if (result.isComplete) {
    return createToolResponse({
      isComplete: true,
      sessionId: wizardSession.sessionId,
      answers: wizardSession.answers,
      message:
        'すべての質問に回答しました。save_configを実行して設定を保存してください。',
      nextAction: 'save_config',
    });
  }

  const nextQuestion = SetupWizard.getCurrentQuestion(wizardSession);

  return createToolResponse({
    success: true,
    currentStep: wizardSession.currentStep,
    totalSteps: wizardSession.totalSteps,
    progress: Math.round(
      (wizardSession.currentStep / wizardSession.totalSteps) * 100
    ),
    question: {
      id: nextQuestion.id,
      text: nextQuestion.text,
      type: nextQuestion.type,
      options: nextQuestion.options,
      defaultValue: nextQuestion.defaultValue,
      helpText: nextQuestion.helpText,
    },
  });
}

/**
 * save_config handler
 *
 * Saves the configuration from the setup wizard.
 * Requirement: 1.4, 1.5, 1.6
 */
export async function handleSaveConfig(
  ctx: SetupContext,
  args: { confirm: boolean }
) {
  const { confirm } = args;

  if (!confirm) {
    return createToolResponse({
      saved: false,
      message: '設定の保存がキャンセルされました。',
    });
  }

  const wizardSession = ctx.getWizardSession();

  if (!wizardSession) {
    return createToolResponse({
      error: true,
      message:
        'セットアップセッションが見つかりません。start_setup_wizardを実行してください。',
    });
  }

  try {
    const newConfig = SetupWizard.buildConfig(wizardSession);
    await ConfigLoader.save(newConfig);
    ctx.setConfig(newConfig);
    ctx.setWizardSession(null);
    ctx.initializeServices(newConfig);

    return createToolResponse({
      saved: true,
      configPath: ConfigLoader.getConfigPath(),
      userName: newConfig.user.name,
      message: `設定を保存しました。${newConfig.user.name}さん、sageをご利用いただきありがとうございます！`,
      availableTools: [
        'analyze_tasks',
        'set_reminder',
        'find_available_slots',
        'sync_to_notion',
      ],
    });
  } catch (error) {
    return createErrorFromCatch('設定の保存に失敗しました', error);
  }
}
