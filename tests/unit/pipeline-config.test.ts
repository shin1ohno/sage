/**
 * Tests for pipeline-config.ts Zod schemas
 */

import {
  MeetingIntelligenceConfigSchema,
  SlackIntegrationConfigSchema,
} from '../../src/types/pipeline-config.js';

describe('MeetingIntelligenceConfigSchema', () => {
  it('should parse empty object with defaults', () => {
    const result = MeetingIntelligenceConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.briefingWindow).toBe(15);
    expect(result.preMeetingPollInterval).toBe(5);
    expect(result.postMeetingPollInterval).toBe(15);
    expect(result.postMeetingTimeout).toBe(24);
    expect(result.postMeetingDelay).toBe(30);
    expect(result.meetingEndBuffer).toBe(10);
    expect(result.slackLookbackDays).toBe(7);
    expect(result.slackMessageBatchSize).toBe(50);
    expect(result.minimumAttendees).toBe(2);
    expect(result.excludePatterns).toEqual([]);
    expect(result.dailySummaryEnabled).toBe(true);
    expect(result.promptsDir).toBe('~/.sage/prompts/');
  });

  it('should parse full config with custom values', () => {
    const result = MeetingIntelligenceConfigSchema.parse({
      enabled: true,
      briefingWindow: 30,
      preMeetingPollInterval: 10,
      postMeetingPollInterval: 30,
      postMeetingTimeout: 12,
      postMeetingDelay: 60,
      meetingEndBuffer: 5,
      slackLookbackDays: 14,
      slackMessageBatchSize: 100,
      minimumAttendees: 3,
      excludePatterns: [{ type: 'title', pattern: '1:1' }],
      dailySummaryEnabled: false,
      promptsDir: '/custom/prompts/',
    });
    expect(result.enabled).toBe(true);
    expect(result.briefingWindow).toBe(30);
    expect(result.excludePatterns).toHaveLength(1);
    expect(result.excludePatterns[0].type).toBe('title');
  });

  it('should reject briefingWindow below minimum', () => {
    const result = MeetingIntelligenceConfigSchema.safeParse({
      briefingWindow: 2,
    });
    expect(result.success).toBe(false);
  });

  it('should reject briefingWindow above maximum', () => {
    const result = MeetingIntelligenceConfigSchema.safeParse({
      briefingWindow: 120,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid excludePattern type', () => {
    const result = MeetingIntelligenceConfigSchema.safeParse({
      excludePatterns: [{ type: 'invalid', pattern: 'test' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject minimumAttendees below 2', () => {
    const result = MeetingIntelligenceConfigSchema.safeParse({
      minimumAttendees: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('SlackIntegrationConfigSchema', () => {
  it('should parse empty object with defaults', () => {
    const result = SlackIntegrationConfigSchema.parse({});
    expect(result.enabled).toBe(false);
  });

  it('should parse config with enabled flag', () => {
    const result = SlackIntegrationConfigSchema.parse({
      enabled: true,
    });
    expect(result.enabled).toBe(true);
  });
});
