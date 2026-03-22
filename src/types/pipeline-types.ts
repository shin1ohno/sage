/**
 * Pipeline type definitions and Zod schemas for Meeting Intelligence Pipeline
 */

import { z } from 'zod';
import type { CalendarEvent } from './google-calendar-types.js';

// ============================================================
// Zod Schemas
// ============================================================

/**
 * Action Item Schema
 * Represents an action item extracted from meeting post-processing
 */
export const ActionItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignee: z.string().optional(),
  assigneeEmail: z.string().optional(),
  assigneeSlackId: z.string().optional(),
  dueDate: z.string(),
  source: z.string(),
  meetingEventId: z.string(),
  reminderCreated: z.boolean(),
  createdAt: z.string(),
});

/**
 * Meeting Processing State Schema
 * Tracks the processing state of a single meeting through the pipeline
 */
export const MeetingProcessingStateSchema = z.object({
  eventId: z.string(),
  recurringEventId: z.string().optional(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  briefing: z.object({
    status: z.enum(['pending', 'sent', 'skipped', 'error']),
    sentAt: z.string().optional(),
    error: z.string().optional(),
  }),
  postMeeting: z.object({
    status: z.enum(['pending', 'polling', 'processed', 'skipped', 'error']),
    pollStartedAt: z.string().optional(),
    lastPollAt: z.string().optional(),
    processedAt: z.string().optional(),
    sources: z.array(z.string()).default([]),
    error: z.string().optional(),
  }),
  actionItems: z.array(ActionItemSchema).default([]),
});

/**
 * Pipeline State File Schema
 * Top-level schema for the persisted pipeline state file
 */
export const PipelineStateFileSchema = z.object({
  version: z.literal(1),
  lastUpdated: z.string(),
  meetings: z.record(z.string(), MeetingProcessingStateSchema),
  channelMappings: z.record(z.string(), z.array(z.string())),
  dailyMetrics: z.record(z.string(), z.object({
    briefingsSent: z.number().default(0),
    postMeetingProcessed: z.number().default(0),
    actionItemsCreated: z.number().default(0),
    errors: z.number().default(0),
  })),
});

// ============================================================
// Inferred Types from Zod Schemas
// ============================================================

export type ActionItem = z.infer<typeof ActionItemSchema>;
export type MeetingProcessingState = z.infer<typeof MeetingProcessingStateSchema>;
export type PipelineStateFile = z.infer<typeof PipelineStateFileSchema>;

// ============================================================
// Interfaces and Types
// ============================================================

/**
 * Result of sending a pre-meeting briefing
 */
export type BriefingResult =
  | { status: 'sent'; messageTs: string }
  | { status: 'skipped'; reason: string };

/**
 * Result of polling for post-meeting sources
 */
export type PollResult =
  | { status: 'waiting' }
  | { status: 'ready'; transcript: string | null; notionNotes: string | null };

/**
 * Links to source materials used in pipeline processing
 */
export interface SourceLinks {
  notionUrls: string[];
  transcriptUrl?: string;
  slackChannelUrls?: string[];
}

/**
 * Result of post-meeting processing
 */
export interface PostMeetingResult {
  summary: string;
  actionItems: ActionItem[];
  sourceLanguage: string;
  sources: string[];
  sourceLinks: SourceLinks;
}

/**
 * Context gathered for pre-meeting briefing generation
 */
export interface BriefingContext {
  slackChannelSummaries: string[];
  notionDocSummaries: string[];
  previousActionItems: ActionItem[];
  attendees: CalendarEvent['attendees'];
  agenda?: string;
  sourceLinks: SourceLinks;
}

/**
 * Action item with completion status tracking
 */
export interface ActionItemWithStatus {
  item: ActionItem;
  completed: boolean;
}

/**
 * Current pipeline execution status
 */
export interface PipelineStatus {
  isRunning: boolean;
  briefingsSentToday: number;
  postMeetingProcessedToday: number;
  actionItemsCreatedToday: number;
  errorsToday: number;
  pendingPostMeetingPolls: number;
}

/**
 * Critical pipeline error for alerting and debugging
 */
export interface CriticalPipelineError {
  type: string;
  message: string;
  timestamp: string;
  details?: unknown;
}
