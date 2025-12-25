/**
 * Setup Wizard Unit Tests
 * Requirements: 1.1-1.6
 */

import { SetupWizard } from '../../src/setup/wizard.js';
import { WIZARD_QUESTIONS } from '../../src/setup/questions.js';

describe('SetupWizard', () => {
  describe('createSession', () => {
    it('should create a new wizard session with unique ID', () => {
      const session = SetupWizard.createSession();

      expect(session.sessionId).toBeTruthy();
      expect(session.sessionId).toMatch(/^session_/);
    });

    it('should start at step 1', () => {
      const session = SetupWizard.createSession();

      expect(session.currentStep).toBe(1);
    });

    it('should have correct total steps for full mode', () => {
      const session = SetupWizard.createSession('full');
      const fullQuestions = WIZARD_QUESTIONS;

      expect(session.totalSteps).toBe(fullQuestions.length);
      expect(session.mode).toBe('full');
    });

    it('should have fewer steps for quick mode', () => {
      const quickSession = SetupWizard.createSession('quick');
      const fullSession = SetupWizard.createSession('full');

      expect(quickSession.totalSteps).toBeLessThan(fullSession.totalSteps);
      expect(quickSession.mode).toBe('quick');
    });

    it('should initialize with empty answers', () => {
      const session = SetupWizard.createSession();

      expect(session.answers).toEqual({});
    });
  });

  describe('getCurrentQuestion', () => {
    it('should return the first question for a new session', () => {
      const session = SetupWizard.createSession();
      const question = SetupWizard.getCurrentQuestion(session);

      expect(question.id).toBe('user_name');
    });

    it('should return appropriate question after answering', () => {
      const session = SetupWizard.createSession();
      SetupWizard.answerQuestion(session, 'user_name', 'Test User');

      const question = SetupWizard.getCurrentQuestion(session);

      expect(question.id).toBe('timezone');
    });
  });

  describe('answerQuestion', () => {
    it('should accept valid text answer', () => {
      const session = SetupWizard.createSession();
      const result = SetupWizard.answerQuestion(session, 'user_name', 'John Doe');

      expect(result.success).toBe(true);
      expect(session.answers['user_name']).toBe('John Doe');
    });

    it('should reject mismatched question ID', () => {
      const session = SetupWizard.createSession();
      const result = SetupWizard.answerQuestion(session, 'wrong_id', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('一致しません');
    });

    it('should validate time format', () => {
      const session = SetupWizard.createSession();
      // Answer first two questions to get to work_start
      SetupWizard.answerQuestion(session, 'user_name', 'Test');
      SetupWizard.answerQuestion(session, 'timezone', 'Asia/Tokyo');

      const invalidResult = SetupWizard.answerQuestion(session, 'work_start', 'invalid');
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain('HH:MM');

      const validResult = SetupWizard.answerQuestion(session, 'work_start', '09:00');
      expect(validResult.success).toBe(true);
    });

    it('should validate select options', () => {
      const session = SetupWizard.createSession();
      SetupWizard.answerQuestion(session, 'user_name', 'Test');

      const invalidResult = SetupWizard.answerQuestion(session, 'timezone', 'Invalid/Zone');
      expect(invalidResult.success).toBe(false);

      const validResult = SetupWizard.answerQuestion(session, 'timezone', 'Asia/Tokyo');
      expect(validResult.success).toBe(true);
    });

    it('should advance to next step on valid answer', () => {
      const session = SetupWizard.createSession();
      SetupWizard.answerQuestion(session, 'user_name', 'Test');

      expect(session.currentStep).toBe(2);
    });

    it('should mark complete when all questions answered', () => {
      const session = SetupWizard.createSession('quick');

      // Answer all essential questions
      const essentialQuestions = WIZARD_QUESTIONS.filter((q) => q.essential);
      let result;

      for (const question of essentialQuestions) {
        let answer: string | string[];
        if (question.defaultValue !== undefined) {
          answer = question.defaultValue;
        } else if (question.type === 'text') {
          answer = 'Test';
        } else if (question.options && question.options.length > 0) {
          answer = question.options[0];
        } else {
          answer = 'Test';
        }
        result = SetupWizard.answerQuestion(session, question.id, answer);
      }

      expect(result!.isComplete).toBe(true);
    });
  });

  describe('validateAnswer', () => {
    it('should accept default value when answer is empty', () => {
      const question = WIZARD_QUESTIONS.find((q) => q.defaultValue !== undefined)!;
      const result = SetupWizard.validateAnswer(question, '');

      expect(result.valid).toBe(true);
    });

    it('should reject empty answer without default', () => {
      const question = WIZARD_QUESTIONS.find((q) => q.id === 'user_name')!;
      const result = SetupWizard.validateAnswer(question, '');

      expect(result.valid).toBe(false);
    });

    it('should validate day selection', () => {
      const daysQuestion = WIZARD_QUESTIONS.find((q) => q.type === 'days')!;

      const validResult = SetupWizard.validateAnswer(daysQuestion, ['Monday', 'Tuesday']);
      expect(validResult.valid).toBe(true);

      const invalidResult = SetupWizard.validateAnswer(daysQuestion, ['InvalidDay']);
      expect(invalidResult.valid).toBe(false);
    });

    it('should validate multiselect with valid options', () => {
      const multiselectQuestion = {
        id: 'test_multiselect',
        text: 'Test multiselect',
        type: 'multiselect' as const,
        options: ['option1', 'option2', 'option3'],
        essential: false,
      };

      const validResult = SetupWizard.validateAnswer(multiselectQuestion, ['option1', 'option2']);
      expect(validResult.valid).toBe(true);
    });

    it('should reject multiselect with invalid options', () => {
      const multiselectQuestion = {
        id: 'test_multiselect',
        text: 'Test multiselect',
        type: 'multiselect' as const,
        options: ['option1', 'option2', 'option3'],
        essential: false,
      };

      const invalidResult = SetupWizard.validateAnswer(multiselectQuestion, ['option1', 'invalid_option']);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('invalid_option');
    });
  });

  describe('buildConfig', () => {
    it('should build valid config from answers', () => {
      const session = SetupWizard.createSession('quick');

      // Fill essential answers
      session.answers = {
        user_name: 'Test User',
        timezone: 'Asia/Tokyo',
        work_start: '09:00',
        work_end: '18:00',
        apple_reminders_enabled: 'yes',
      };

      const config = SetupWizard.buildConfig(session);

      expect(config.user.name).toBe('Test User');
      expect(config.user.timezone).toBe('Asia/Tokyo');
      expect(config.calendar.workingHours.start).toBe('09:00');
      expect(config.calendar.workingHours.end).toBe('18:00');
      expect(config.integrations.appleReminders.enabled).toBe(true);
      expect(config.version).toBe('1.0.0');
    });

    it('should use default values for missing answers', () => {
      const session = SetupWizard.createSession('quick');
      session.answers = {
        user_name: 'Test',
      };

      const config = SetupWizard.buildConfig(session);

      expect(config.calendar.workingHours.start).toBe('09:00');
      expect(config.preferences.language).toBe('ja');
    });

    it('should configure manager when manager_name is provided', () => {
      const session = SetupWizard.createSession('full');
      session.answers = {
        user_name: 'Test User',
        manager_name: 'John Boss',
      };

      const config = SetupWizard.buildConfig(session);

      expect(config.team.manager).toBeDefined();
      expect(config.team.manager!.name).toBe('John Boss');
      expect(config.team.manager!.role).toBe('manager');
      expect(config.team.manager!.keywords).toContain('john boss');
    });

    it('should handle empty user_name with fallback', () => {
      const session = SetupWizard.createSession('quick');
      session.answers = {};

      const config = SetupWizard.buildConfig(session);

      expect(config.user.name).toBe('');
    });
  });
});
