/**
 * Tests for config migration (meetingIntelligence and slack)
 */

import { GOOGLE_CALENDAR_SCOPES } from '../../src/oauth/google-oauth-handler.js';
import type { UserConfig } from '../../src/types/config.js';

describe('GOOGLE_CALENDAR_SCOPES', () => {
  it('should include drive.readonly scope', () => {
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      'https://www.googleapis.com/auth/drive.readonly'
    );
  });

  it('should include calendar scopes', () => {
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      'https://www.googleapis.com/auth/calendar'
    );
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      'https://www.googleapis.com/auth/calendar.readonly'
    );
  });

  it('should include directory scope', () => {
    expect(GOOGLE_CALENDAR_SCOPES).toContain(
      'https://www.googleapis.com/auth/directory.readonly'
    );
  });
});

describe('DEFAULT_CONFIG', () => {
  // Dynamic import to avoid module-level side effects
  let DEFAULT_CONFIG: UserConfig;

  beforeAll(async () => {
    const module = await import('../../src/types/config.js');
    DEFAULT_CONFIG = module.DEFAULT_CONFIG;
  });

  it('should include meetingIntelligence with defaults', () => {
    expect(DEFAULT_CONFIG.meetingIntelligence).toBeDefined();
    expect(DEFAULT_CONFIG.meetingIntelligence.enabled).toBe(false);
    expect(DEFAULT_CONFIG.meetingIntelligence.briefingWindow).toBe(15);
    expect(DEFAULT_CONFIG.meetingIntelligence.minimumAttendees).toBe(2);
    expect(DEFAULT_CONFIG.meetingIntelligence.excludePatterns).toEqual([]);
    expect(DEFAULT_CONFIG.meetingIntelligence.promptsDir).toBe('~/.sage/prompts/');
  });

  it('should include slack integration in integrations', () => {
    expect(DEFAULT_CONFIG.integrations.slack).toBeDefined();
    expect(DEFAULT_CONFIG.integrations.slack.enabled).toBe(false);
  });
});
