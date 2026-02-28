/**
 * Pipeline State Persistence Service
 *
 * Manages persistent state for the meeting intelligence pipeline,
 * including meeting processing status, channel mappings, and daily metrics.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  PipelineStateFileSchema,
  MeetingProcessingState,
  ActionItem,
  PipelineStateFile,
} from '../types/pipeline-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pipeline-state-store');

export class PipelineStateStore {
  private readonly filePath: string;
  private state: PipelineStateFile;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDebounceMs = 1000;

  constructor(configDir?: string) {
    const dir = configDir ?? path.join(os.homedir(), '.sage');
    this.filePath = path.join(dir, 'pipeline-state.json');
    this.state = {
      version: 1 as const,
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

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const backupPath = `${this.filePath}.backup.${Date.now()}`;
      logger.warn({ backupPath }, 'Failed to parse pipeline state JSON, backing up and reinitializing');
      await fs.rename(this.filePath, backupPath);
      return;
    }

    const result = PipelineStateFileSchema.safeParse(parsed);
    if (result.success) {
      this.state = result.data;
    } else {
      const backupPath = `${this.filePath}.backup.${Date.now()}`;
      logger.warn({ backupPath, errors: result.error.issues }, 'Pipeline state schema validation failed, backing up and reinitializing');
      await fs.rename(this.filePath, backupPath);
    }
  }

  save(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      try {
        this.state.lastUpdated = new Date().toISOString();
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2));
      } catch (error) {
        logger.error({ err: error }, 'Failed to save pipeline state');
      }
    }, this.saveDebounceMs);
  }

  async flush(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.state.lastUpdated = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2));
  }

  getBriefingStatus(eventId: string): MeetingProcessingState | null {
    return this.state.meetings[eventId] ?? null;
  }

  setBriefingStatus(eventId: string, status: Partial<MeetingProcessingState['briefing']> & Pick<MeetingProcessingState['briefing'], 'status'>): void {
    this.ensureMeeting(eventId);
    const meeting = this.state.meetings[eventId];
    meeting.briefing = {
      ...meeting.briefing,
      ...status,
    };
    this.save();
  }

  getPostMeetingStatus(eventId: string): MeetingProcessingState | null {
    return this.state.meetings[eventId] ?? null;
  }

  setPostMeetingStatus(eventId: string, status: Partial<MeetingProcessingState['postMeeting']> & Pick<MeetingProcessingState['postMeeting'], 'status'>): void {
    this.ensureMeeting(eventId);
    const meeting = this.state.meetings[eventId];
    meeting.postMeeting = {
      ...meeting.postMeeting,
      ...status,
    };
    this.save();
  }

  getActionItemsForRecurring(recurringEventId: string, lastOnly: boolean): ActionItem[] {
    const matching = Object.values(this.state.meetings).filter(
      (m) => m.recurringEventId === recurringEventId
    );

    if (matching.length === 0) {
      return [];
    }

    if (lastOnly) {
      const latest = matching.reduce((a, b) =>
        a.startTime > b.startTime ? a : b
      );
      return latest.actionItems;
    }

    return matching.flatMap((m) => m.actionItems);
  }

  recordActionItems(eventId: string, items: ActionItem[]): void {
    this.ensureMeeting(eventId);
    this.state.meetings[eventId].actionItems.push(...items);
    this.save();
  }

  getChannelMapping(meetingPattern: string): string[] | null {
    return this.state.channelMappings[meetingPattern] ?? null;
  }

  setChannelMapping(meetingPattern: string, channelIds: string[]): void {
    this.state.channelMappings[meetingPattern] = channelIds;
    this.save();
  }

  pruneOldEntries(retentionDays: number): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffIso = cutoff.toISOString();

    for (const [eventId, meeting] of Object.entries(this.state.meetings)) {
      if (meeting.startTime && meeting.startTime < cutoffIso) {
        delete this.state.meetings[eventId];
      }
    }

    this.save();
  }

  getState(): PipelineStateFile {
    return this.state;
  }

  getDailyMetrics(): PipelineStateFile['dailyMetrics'] {
    return { ...this.state.dailyMetrics };
  }

  incrementMetric(metric: keyof Omit<PipelineStateFile['dailyMetrics'], 'date'>, value = 1): void {
    const today = new Date().toISOString().slice(0, 10);

    if (this.state.dailyMetrics.date !== today) {
      this.state.dailyMetrics.date = today;
      this.state.dailyMetrics.briefingsSent = 0;
      this.state.dailyMetrics.postMeetingProcessed = 0;
      this.state.dailyMetrics.actionItemsCreated = 0;
      this.state.dailyMetrics.errors = 0;
    }

    (this.state.dailyMetrics[metric] as number) += value;
    this.save();
  }

  ensureMeetingMetadata(eventId: string, metadata: {
    title: string;
    startTime: string;
    endTime: string;
    recurringEventId?: string;
  }): void {
    this.ensureMeeting(eventId);
    const meeting = this.state.meetings[eventId];
    meeting.title = metadata.title;
    meeting.startTime = metadata.startTime;
    meeting.endTime = metadata.endTime;
    meeting.recurringEventId = metadata.recurringEventId;
    this.save();
  }

  getMeeting(eventId: string): MeetingProcessingState | null {
    return this.state.meetings[eventId] ?? null;
  }

  private ensureMeeting(eventId: string): void {
    if (!this.state.meetings[eventId]) {
      this.state.meetings[eventId] = {
        eventId,
        title: '',
        startTime: '',
        endTime: '',
        briefing: { status: 'pending' },
        postMeeting: { status: 'pending' },
        actionItems: [],
      };
    }
  }
}
