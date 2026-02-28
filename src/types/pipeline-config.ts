/**
 * Meeting Intelligence Pipeline configuration schemas
 * Zod schemas for meetingIntelligence and Slack integration config
 */

import { z } from 'zod';

// ============================================================
// Meeting Intelligence Config
// ============================================================

export const MeetingIntelligenceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  briefingWindow: z.number().min(5).max(60).default(15),
  preMeetingPollInterval: z.number().min(1).max(30).default(5),
  postMeetingPollInterval: z.number().min(5).max(60).default(15),
  postMeetingTimeout: z.number().min(1).max(48).default(24),
  postMeetingDelay: z.number().min(0).max(120).default(30),
  meetingEndBuffer: z.number().min(0).max(30).default(10),
  slackLookbackDays: z.number().min(1).max(30).default(7),
  slackMessageBatchSize: z.number().min(10).max(200).default(50),
  minimumAttendees: z.number().min(2).default(2),
  excludePatterns: z.array(z.object({
    type: z.enum(['title', 'calendar']),
    pattern: z.string(),
  })).default([]),
  dailySummaryEnabled: z.boolean().default(true),
  promptsDir: z.string().default('~/.sage/prompts/'),
});

export type MeetingIntelligenceConfig = z.infer<typeof MeetingIntelligenceConfigSchema>;

// ============================================================
// Slack Integration Config
// ============================================================

export const SlackIntegrationConfigSchema = z.object({
  enabled: z.boolean().default(false),
});

export type SlackIntegrationConfig = z.infer<typeof SlackIntegrationConfigSchema>;
