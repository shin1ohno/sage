/**
 * PipelineStateStore
 *
 * Manages pipeline state persistence for the Meeting Intelligence Pipeline.
 * State is stored as JSON at ~/.sage/pipeline-state.json with debounced writes.
 *
 * Requirements: R10.1-R10.7
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  PipelineStateFileSchema,
  type PipelineStateFile,
  type MeetingProcessingState,
  type ActionItem,
} from '../types/pipeline-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pipeline-state');

/**
 * Create a default empty pipeline state
 */
function createDefaultState(): PipelineStateFile {
  return {
    version: 1,
    lastUpdated: '',
    meetings: {},
    channelMappings: {},
    dailyMetrics: {
      date: '',
      briefingsSent: 0,
      postMeetingProcessed: 0,
      actionItemsCreated: 0,
      errors: 0,
    },
  };
}

export class PipelineStateStore {
  private state: PipelineStateFile = createDefaultState();
  private filePath: string;
  private configDir: string;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private saveDebounceMs = 1000;

  constructor(configDir?: string) {
    this.configDir = configDir || join(homedir(), '.sage');
    this.filePath = join(this.configDir, 'pipeline-state.json');
  }

  /**
   * Load state from file or create default
   */
  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      const result = PipelineStateFileSchema.safeParse(parsed);

      if (result.success) {
        this.state = result.data;
        logger.info('Pipeline state loaded');
      } else {
        // Schema validation failed — backup and reset
        const backupPath = `${this.filePath}.backup.${Date.now()}`;
        await rename(this.filePath, backupPath);
        logger.warn({ backupPath, errors: result.error.issues }, 'Schema validation failed, backed up old state');
        this.state = createDefaultState();
      }
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        // Invalid JSON — backup and reset
        try {
          const backupPath = `${this.filePath}.backup.${Date.now()}`;
          await rename(this.filePath, backupPath);
          logger.warn({ backupPath }, 'Invalid JSON in state file, backed up old state');
        } catch {
          // rename failed — file may have been deleted between read and rename
        }
        this.state = createDefaultState();
      } else if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No existing state file, starting fresh');
        this.state = createDefaultState();
      } else {
        throw error;
      }
    }
  }

  /**
   * Debounced save to file
   */
  save(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      try {
        this.state.lastUpdated = new Date().toISOString();
        await mkdir(this.configDir, { recursive: true });
        await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
      } catch (error) {
        logger.error({ err: error }, 'Failed to save pipeline state');
      }
    }, this.saveDebounceMs);
  }

  /**
   * Immediate save — for shutdown
   */
  async flush(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.state.lastUpdated = new Date().toISOString();
    await mkdir(this.configDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  /**
   * Get full state
   */
  getState(): PipelineStateFile {
    return this.state;
  }

  /**
   * Get meeting entry
   */
  getMeeting(eventId: string): MeetingProcessingState | null {
    return this.state.meetings[eventId] ?? null;
  }

  // ------------------------------------------------------------------
  // Briefing status
  // ------------------------------------------------------------------

  getBriefingStatus(eventId: string): MeetingProcessingState | null {
    return this.state.meetings[eventId] ?? null;
  }

  setBriefingStatus(
    eventId: string,
    status: { status: string; sentAt?: string; error?: string }
  ): void {
    if (!this.state.meetings[eventId]) {
      this.state.meetings[eventId] = {
        eventId,
        title: '',
        startTime: '',
        briefing: { status: 'pending' },
        postMeeting: { status: 'pending' },
        actionItems: [],
      };
    }
    this.state.meetings[eventId].briefing = {
      ...this.state.meetings[eventId].briefing,
      ...status,
    };
    this.save();
  }

  // ------------------------------------------------------------------
  // Post-meeting status
  // ------------------------------------------------------------------

  getPostMeetingStatus(eventId: string): MeetingProcessingState | null {
    return this.state.meetings[eventId] ?? null;
  }

  setPostMeetingStatus(
    eventId: string,
    status: {
      status: string;
      pollStartedAt?: string;
      lastPollAt?: string;
      processedAt?: string;
      sources?: { transcript: boolean; notionNotes: boolean };
      error?: string;
    }
  ): void {
    if (!this.state.meetings[eventId]) {
      this.state.meetings[eventId] = {
        eventId,
        title: '',
        startTime: '',
        briefing: { status: 'pending' },
        postMeeting: { status: 'pending' },
        actionItems: [],
      };
    }
    this.state.meetings[eventId].postMeeting = {
      ...this.state.meetings[eventId].postMeeting,
      ...status,
    };
    this.save();
  }

  // ------------------------------------------------------------------
  // Action items
  // ------------------------------------------------------------------

  getActionItemsForRecurring(recurringEventId: string, lastOnly: boolean): ActionItem[] {
    const matchingEntries = Object.values(this.state.meetings).filter(
      (m) => m.recurringEventId === recurringEventId
    );

    if (matchingEntries.length === 0) return [];

    if (lastOnly) {
      // Sort by startTime descending and return the latest entry's action items
      const sorted = matchingEntries.sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
      return sorted[0].actionItems;
    }

    // Return all action items from all matching entries
    return matchingEntries.flatMap((m) => m.actionItems);
  }

  recordActionItems(eventId: string, items: ActionItem[]): void {
    if (!this.state.meetings[eventId]) {
      this.state.meetings[eventId] = {
        eventId,
        title: '',
        startTime: '',
        briefing: { status: 'pending' },
        postMeeting: { status: 'pending' },
        actionItems: [],
      };
    }
    this.state.meetings[eventId].actionItems.push(...items);
    this.save();
  }

  // ------------------------------------------------------------------
  // Channel mappings
  // ------------------------------------------------------------------

  getChannelMapping(meetingPattern: string): string[] | null {
    return this.state.channelMappings[meetingPattern] ?? null;
  }

  setChannelMapping(meetingPattern: string, channelIds: string[]): void {
    this.state.channelMappings[meetingPattern] = channelIds;
    this.save();
  }

  // ------------------------------------------------------------------
  // Maintenance
  // ------------------------------------------------------------------

  pruneOldEntries(retentionDays: number): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffTime = cutoff.getTime();

    for (const [eventId, meeting] of Object.entries(this.state.meetings)) {
      if (meeting.startTime && new Date(meeting.startTime).getTime() < cutoffTime) {
        delete this.state.meetings[eventId];
      }
    }
    this.save();
  }
}
