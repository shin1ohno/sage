/**
 * Meeting Intelligence Pipeline configuration schemas
 * Defines Zod schemas for pipeline and Slack integration settings
 */

import { z } from 'zod';

/**
 * Meeting Intelligence Configuration Schema
 * Controls pipeline behavior for briefing, polling, and post-meeting processing
 */
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

/**
 * Slack Integration Configuration Schema
 * OAuth credentials for Slack workspace integration
 */
export const SlackIntegrationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
});

export type MeetingIntelligenceConfig = z.infer<typeof MeetingIntelligenceConfigSchema>;
export type SlackIntegrationConfig = z.infer<typeof SlackIntegrationConfigSchema>;
