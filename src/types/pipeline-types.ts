/**
 * Meeting Intelligence Pipeline Types
 * Shared types for the pipeline scheduler and its components.
 */

/**
 * Pipeline status snapshot for monitoring and daily summaries
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
 * Critical error types that require immediate notification
 */
export interface CriticalPipelineError {
  type: 'slack_auth' | 'google_auth';
  message: string;
  timestamp: string;
}

/**
 * Daily metrics stored in the pipeline state
 */
export interface DailyMetrics {
  date: string;
  briefingsSent: number;
  postMeetingProcessed: number;
  actionItemsCreated: number;
  errors: number;
}

/**
 * Briefing status for a meeting
 */
export interface BriefingStatus {
  status: 'gathering' | 'sent' | 'skipped' | 'failed';
  sentAt?: string;
  error?: string;
}

/**
 * Post-meeting processing status
 */
export interface PostMeetingStatus {
  status: 'waiting' | 'polling' | 'processed' | 'failed' | 'timeout';
  pollStartedAt?: string;
  lastPollAt?: string;
  processedAt?: string;
  sources?: { transcript: boolean; notionNotes: boolean };
  error?: string;
}

/**
 * Meeting processing state stored in the state file
 */
export interface MeetingProcessingState {
  title: string;
  startTime: string;
  endTime: string;
  recurringEventId?: string;
  briefing?: BriefingStatus;
  postMeeting?: PostMeetingStatus;
}

/**
 * Pipeline state file structure
 */
export interface PipelineStateFile {
  version: number;
  lastUpdated: string;
  meetings: Record<string, MeetingProcessingState>;
  channelMappings: Record<string, string>;
  dailyMetrics: DailyMetrics;
}

/**
 * Briefing generation result
 */
export interface BriefingResult {
  status: 'sent' | 'skipped';
  messageTs?: string;
}

/**
 * Post-meeting poll result
 */
export interface PollResult {
  status: 'waiting' | 'ready';
  transcript?: string;
  notionNotes?: string;
}

/**
 * Post-meeting processing result
 */
export interface PostMeetingResult {
  summary: string;
  actionItems: Array<{ title: string; assignee?: string }>;
  sourceLanguage: string;
  sources: { transcript: boolean; notionNotes: boolean };
  sourceLinks: { notionUrls: string[] };
}
