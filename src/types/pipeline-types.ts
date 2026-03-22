/**
 * Pipeline types for the Meeting Intelligence Pipeline.
 */

export interface SourceLinks {
  notionUrls: string[];
  slackChannels: string[];
  transcriptUrl?: string;
}

export interface PipelineStatus {
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
