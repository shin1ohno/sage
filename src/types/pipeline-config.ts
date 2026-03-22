/**
 * Meeting Intelligence Pipeline Configuration Types
 * Defines configuration for the pipeline scheduler and its components.
 */

/**
 * Exclude pattern for meeting filtering
 */
export interface ExcludePattern {
  type: 'title' | 'calendar';
  pattern: string;
}

/**
 * Configuration for the Meeting Intelligence Pipeline
 */
export interface MeetingIntelligenceConfig {
  enabled: boolean;
  /** Minutes before meeting start to generate briefing */
  briefingWindow: number;
  /** Minutes between pre-meeting polling cycles */
  preMeetingPollInterval: number;
  /** Minutes between post-meeting polling cycles */
  postMeetingPollInterval: number;
  /** Hours before post-meeting polling times out */
  postMeetingTimeout: number;
  /** Minutes after meeting end before starting post-meeting processing */
  postMeetingDelay: number;
  /** Minutes of buffer after meeting end for potential overruns */
  meetingEndBuffer: number;
  /** Days to look back for Slack messages */
  slackLookbackDays: number;
  /** Number of Slack messages to fetch per batch */
  slackMessageBatchSize: number;
  /** Minimum number of attendees for a meeting to be processed */
  minimumAttendees: number;
  /** Patterns to exclude meetings from processing */
  excludePatterns: ExcludePattern[];
  /** Whether to send daily summary */
  dailySummaryEnabled: boolean;
  /** Directory for prompt templates */
  promptsDir: string;
}
