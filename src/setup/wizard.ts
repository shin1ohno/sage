/**
 * Setup Wizard
 * Interactive wizard for initial sage configuration
 */

import type { UserConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { WIZARD_QUESTIONS, type Question } from './questions.js';

export interface WizardSession {
  sessionId: string;
  mode: 'full' | 'quick';
  currentStep: number;
  totalSteps: number;
  answers: Record<string, string | string[]>;
  startedAt: string;
}

interface AnswerResult {
  success: boolean;
  error?: string;
  isComplete?: boolean;
  currentQuestion?: Question;
}

export class SetupWizard {
  /**
   * Create a new wizard session
   */
  static createSession(mode: 'full' | 'quick' = 'full'): WizardSession {
    const questions = this.getQuestionsForMode(mode);

    return {
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      mode,
      currentStep: 1,
      totalSteps: questions.length,
      answers: {},
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Get questions based on mode
   */
  static getQuestionsForMode(mode: 'full' | 'quick'): Question[] {
    if (mode === 'quick') {
      return WIZARD_QUESTIONS.filter((q) => q.essential);
    }
    return WIZARD_QUESTIONS;
  }

  /**
   * Get the current question for a session
   */
  static getCurrentQuestion(session: WizardSession): Question {
    const questions = this.getQuestionsForMode(session.mode);
    return questions[session.currentStep - 1];
  }

  /**
   * Answer a question and advance to the next
   */
  static answerQuestion(
    session: WizardSession,
    questionId: string,
    answer: string | string[]
  ): AnswerResult {
    const currentQuestion = this.getCurrentQuestion(session);

    // Validate question ID matches
    if (currentQuestion.id !== questionId) {
      return {
        success: false,
        error: `質問IDが一致しません。期待: ${currentQuestion.id}, 受信: ${questionId}`,
        currentQuestion,
      };
    }

    // Validate answer
    const validationResult = this.validateAnswer(currentQuestion, answer);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error,
        currentQuestion,
      };
    }

    // Store answer
    session.answers[questionId] = answer;
    session.currentStep++;

    // Check if complete
    const questions = this.getQuestionsForMode(session.mode);
    if (session.currentStep > questions.length) {
      return {
        success: true,
        isComplete: true,
      };
    }

    return {
      success: true,
      isComplete: false,
    };
  }

  /**
   * Validate an answer against a question
   */
  static validateAnswer(
    question: Question,
    answer: string | string[]
  ): { valid: boolean; error?: string } {
    // Check if answer is provided
    if (answer === undefined || answer === null || answer === '') {
      if (question.defaultValue !== undefined) {
        return { valid: true };
      }
      return { valid: false, error: 'この質問には回答が必要です。' };
    }

    // Validate based on question type
    switch (question.type) {
      case 'select':
        if (question.options && !question.options.includes(answer as string)) {
          return {
            valid: false,
            error: `無効な選択肢です。有効な選択肢: ${question.options.join(', ')}`,
          };
        }
        break;

      case 'multiselect':
        if (Array.isArray(answer)) {
          const invalid = answer.filter((a) => !question.options?.includes(a));
          if (invalid.length > 0) {
            return {
              valid: false,
              error: `無効な選択肢が含まれています: ${invalid.join(', ')}`,
            };
          }
        }
        break;

      case 'time':
        if (!/^\d{2}:\d{2}$/.test(answer as string)) {
          return {
            valid: false,
            error: '時刻はHH:MM形式で入力してください（例: 09:00）',
          };
        }
        break;

      case 'days':
        const validDays = [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ];
        if (Array.isArray(answer)) {
          const invalid = answer.filter((a) => !validDays.includes(a));
          if (invalid.length > 0) {
            return {
              valid: false,
              error: `無効な曜日が含まれています: ${invalid.join(', ')}`,
            };
          }
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Build a UserConfig from wizard answers
   */
  static buildConfig(session: WizardSession): UserConfig {
    const answers = session.answers;
    const now = new Date().toISOString();

    const config: UserConfig = {
      ...DEFAULT_CONFIG,
      version: '1.0.0',
      createdAt: now,
      lastUpdated: now,
      user: {
        name: (answers.user_name as string) ?? '',
        email: (answers.user_email as string) ?? undefined,
        timezone: (answers.timezone as string) ?? 'Asia/Tokyo',
        role: (answers.user_role as string) ?? undefined,
      },
      calendar: {
        workingHours: {
          start: (answers.work_start as string) ?? '09:00',
          end: (answers.work_end as string) ?? '18:00',
        },
        meetingHeavyDays: (answers.meeting_days as string[]) ?? ['Tuesday', 'Thursday'],
        deepWorkDays: (answers.deep_work_days as string[]) ?? ['Monday', 'Wednesday', 'Friday'],
        deepWorkBlocks: [],
        timeZone: (answers.timezone as string) ?? 'Asia/Tokyo',
      },
      team: {
        manager: answers.manager_name
          ? {
              name: answers.manager_name as string,
              role: 'manager',
              keywords: ['manager', 'マネージャー', (answers.manager_name as string).toLowerCase()],
            }
          : undefined,
        frequentCollaborators: [],
        departments: [],
      },
      integrations: {
        appleReminders: {
          enabled: (answers.apple_reminders_enabled as string) === 'yes',
          threshold: 7,
          unit: 'days',
          defaultList: (answers.apple_reminders_list as string) ?? 'Reminders',
          lists: {},
        },
        notion: {
          enabled: (answers.notion_enabled as string) === 'yes',
          threshold: 8,
          unit: 'days',
          databaseId: (answers.notion_database_id as string) ?? '',
        },
        googleCalendar: {
          enabled: (answers.google_calendar_enabled as string) === 'yes',
          defaultCalendar: 'primary',
          conflictDetection: true,
          lookAheadDays: 14,
        },
      },
      preferences: {
        language: (answers.language as 'ja' | 'en') ?? 'ja',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h',
      },
      priorityRules: DEFAULT_CONFIG.priorityRules,
      estimation: DEFAULT_CONFIG.estimation,
      reminders: DEFAULT_CONFIG.reminders,
    };

    return config;
  }
}
