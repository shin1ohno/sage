/**
 * Meeting Intelligence Pipeline type definitions
 * Zod schemas and derived TypeScript types for pipeline state management
 */

import { z } from 'zod';

// ============================================================
// Zod Schemas
// ============================================================

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

export const MeetingProcessingStateSchema = z.object({
  eventId: z.string(),
  recurringEventId: z.string().optional(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  briefing: z.object({
    status: z.enum(['pending', 'gathering', 'sent', 'skipped', 'failed']),
    sentAt: z.string().optional(),
    error: z.string().optional(),
  }),
  postMeeting: z.object({
    status: z.enum(['pending', 'waiting', 'polling', 'processed', 'timeout', 'failed']),
    pollStartedAt: z.string().optional(),
    lastPollAt: z.string().optional(),
    processedAt: z.string().optional(),
    sources: z.object({
      transcript: z.boolean(),
      notionNotes: z.boolean(),
    }).optional(),
    error: z.string().optional(),
  }),
  actionItems: z.array(ActionItemSchema),
});

export const PipelineStateFileSchema = z.object({
  version: z.literal(1),
  lastUpdated: z.string(),
  meetings: z.record(z.string(), MeetingProcessingStateSchema),
  channelMappings: z.record(z.string(), z.array(z.string())),
  dailyMetrics: z.object({
    date: z.string(),
    briefingsSent: z.number(),
    postMeetingProcessed: z.number(),
    actionItemsCreated: z.number(),
    errors: z.number(),
  }),
});

// ============================================================
// Derived Types
// ============================================================

export type ActionItem = z.infer<typeof ActionItemSchema>;
export type MeetingProcessingState = z.infer<typeof MeetingProcessingStateSchema>;
export type PipelineStateFile = z.infer<typeof PipelineStateFileSchema>;

// ============================================================
// Interface Types
// ============================================================

export type BriefingResult =
  | { status: 'sent'; messageTs: string }
  | { status: 'skipped'; reason: string };

export type PollResult =
  | { status: 'waiting' }
  | { status: 'ready'; transcript: string | null; notionNotes: string | null };

export interface PostMeetingResult {
  summary: string;
  actionItems: ActionItem[];
  sourceLanguage: string;
  sources: { transcript: boolean; notionNotes: boolean };
  sourceLinks: SourceLinks;
}

export interface BriefingContext {
  slackChannelSummaries: Array<{ channelName: string; summary: string }>;
  notionDocSummaries: string[];
  previousActionItems: ActionItemWithStatus[];
  attendees: string[];
  agenda: string | null;
  sourceLinks: SourceLinks;
}

export interface ActionItemWithStatus {
  item: ActionItem;
  completed: boolean;
}

export interface SourceLinks {
  notionUrls: string[];
  transcriptUrl?: string;
  slackChannelUrls?: string[];
}

export interface PipelineStatus {
  isRunning: boolean;
  briefingsSentToday: number;
  postMeetingProcessedToday: number;
  actionItemsCreatedToday: number;
  errorsToday: number;
  pendingPostMeetingPolls: number;
}

export interface CriticalPipelineError {
  type: string;
  message: string;
  timestamp: string;
  details?: string;
}
