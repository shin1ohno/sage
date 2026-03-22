/**
 * Pipeline Types
 *
 * Zod schemas and TypeScript types for the Meeting Intelligence Pipeline state.
 */

import { z } from 'zod';

// ============================================================
// Action Item Schema
// ============================================================

export const ActionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  assignee: z.string().optional(),
  assigneeSlackId: z.string().optional(),
  dueDate: z.string().optional(),
  completed: z.boolean().default(false),
  createdAt: z.string(),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;

// ============================================================
// Meeting Processing State Schema
// ============================================================

export const MeetingProcessingStateSchema = z.object({
  eventId: z.string(),
  title: z.string().default(''),
  startTime: z.string().default(''),
  recurringEventId: z.string().optional(),
  briefing: z
    .object({
      status: z.string().default('pending'),
      sentAt: z.string().optional(),
      error: z.string().optional(),
    })
    .default({}),
  postMeeting: z
    .object({
      status: z.string().default('pending'),
      pollStartedAt: z.string().optional(),
      lastPollAt: z.string().optional(),
      processedAt: z.string().optional(),
      sources: z
        .object({
          transcript: z.boolean().default(false),
          notionNotes: z.boolean().default(false),
        })
        .optional(),
      error: z.string().optional(),
    })
    .default({}),
  actionItems: z.array(ActionItemSchema).default([]),
});

export type MeetingProcessingState = z.infer<typeof MeetingProcessingStateSchema>;

// ============================================================
// Daily Metrics Schema
// ============================================================

export const DailyMetricsSchema = z.object({
  date: z.string().default(''),
  briefingsSent: z.number().default(0),
  postMeetingProcessed: z.number().default(0),
  actionItemsCreated: z.number().default(0),
  errors: z.number().default(0),
});

export type DailyMetrics = z.infer<typeof DailyMetricsSchema>;

// ============================================================
// Pipeline State File Schema
// ============================================================

export const PipelineStateFileSchema = z.object({
  version: z.number().default(1),
  lastUpdated: z.string().default(''),
  meetings: z.record(z.string(), MeetingProcessingStateSchema).default({}),
  channelMappings: z.record(z.string(), z.array(z.string())).default({}),
  dailyMetrics: DailyMetricsSchema.default({}),
});

export type PipelineStateFile = z.infer<typeof PipelineStateFileSchema>;
