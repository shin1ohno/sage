/**
 * SlackBlockKitFormatter Unit Tests
 */

import {
  formatBriefing,
  formatPostMeetingReport,
  formatDailySummary,
  formatCriticalError,
} from '../../src/utils/slack-blocks.js';
import type { SourceLinks, PipelineStatus, CriticalPipelineError } from '../../src/types/pipeline-types.js';

const MAX_BLOCKS = 50;

describe('formatBriefing', () => {
  const sourceLinks: SourceLinks = {
    notionUrls: ['https://www.notion.so/page-abc'],
    slackChannels: ['general'],
  };

  it('produces header + section + context blocks', () => {
    const blocks = formatBriefing('Standup', '10:00', 'Some content', sourceLinks);
    expect(blocks[0].type).toBe('header');
    expect(blocks.some((b) => b.type === 'section')).toBe(true);
    expect(blocks.some((b) => b.type === 'context')).toBe(true);
  });

  it('includes Notion URLs as mrkdwn links in context', () => {
    const blocks = formatBriefing('Standup', '10:00', 'Content', sourceLinks);
    const ctx = blocks.find((b) => b.type === 'context');
    expect(ctx).toBeDefined();
    const elements = ctx!.elements!;
    expect(elements.some((e) => e.text?.includes('<https://www.notion.so/page-abc|Notion>'))).toBe(true);
  });

  it('works with empty sourceLinks', () => {
    const empty: SourceLinks = { notionUrls: [], slackChannels: [] };
    const blocks = formatBriefing('Standup', '10:00', 'Content', empty);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some((b) => b.type === 'context')).toBe(false);
  });

  it('does not exceed 50 blocks', () => {
    const longContent = Array.from({ length: 100 }, (_, i) => `Paragraph ${i}`).join('\n\n');
    const blocks = formatBriefing('Meeting', '10:00', longContent, sourceLinks);
    expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
  });
});

describe('formatPostMeetingReport', () => {
  it('includes transcriptUrl when present in sourceLinks', () => {
    const links: SourceLinks = {
      notionUrls: [],
      slackChannels: [],
      transcriptUrl: 'https://example.com/transcript',
    };
    const blocks = formatPostMeetingReport('Retro', '14:00', 'Summary', links);
    const ctx = blocks.find((b) => b.type === 'context');
    expect(ctx).toBeDefined();
    expect(ctx!.elements!.some((e) => e.text?.includes('Transcript'))).toBe(true);
  });

  it('does not exceed 50 blocks', () => {
    const longContent = Array.from({ length: 100 }, (_, i) => `Section ${i}`).join('\n\n');
    const links: SourceLinks = { notionUrls: [], slackChannels: [] };
    const blocks = formatPostMeetingReport('Meeting', '10:00', longContent, links);
    expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
  });
});

describe('formatDailySummary', () => {
  it('includes all metrics in blocks', () => {
    const status: PipelineStatus = {
      briefingsSentToday: 5,
      postMeetingProcessedToday: 3,
      actionItemsCreatedToday: 12,
      errorsToday: 1,
      pendingPostMeetingPolls: 2,
    };
    const blocks = formatDailySummary(status);
    expect(blocks[0].type).toBe('header');

    const sectionText = blocks[1].text!.text;
    expect(sectionText).toContain('5');
    expect(sectionText).toContain('3');
    expect(sectionText).toContain('12');
    expect(sectionText).toContain('1');
    expect(sectionText).toContain('2');
  });

  it('does not exceed 50 blocks', () => {
    const status: PipelineStatus = {
      briefingsSentToday: 0,
      postMeetingProcessedToday: 0,
      actionItemsCreatedToday: 0,
      errorsToday: 0,
      pendingPostMeetingPolls: 0,
    };
    const blocks = formatDailySummary(status);
    expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
  });
});

describe('formatCriticalError', () => {
  it('includes error info in blocks', () => {
    const error: CriticalPipelineError = {
      type: 'CALENDAR_API_FAILURE',
      message: 'Failed to fetch events',
      timestamp: '2026-03-22T10:00:00Z',
    };
    const blocks = formatCriticalError(error);
    expect(blocks[0].type).toBe('header');
    expect(blocks[1].text!.text).toContain('CALENDAR_API_FAILURE');
    expect(blocks[1].text!.text).toContain('Failed to fetch events');
  });

  it('includes details section when details are provided', () => {
    const error: CriticalPipelineError = {
      type: 'LLM_ERROR',
      message: 'Rate limited',
      timestamp: '2026-03-22T10:00:00Z',
      details: 'Retry after 60 seconds',
    };
    const blocks = formatCriticalError(error);
    expect(blocks.length).toBe(3);
    expect(blocks[2].text!.text).toContain('Retry after 60 seconds');
  });

  it('does not exceed 50 blocks', () => {
    const error: CriticalPipelineError = {
      type: 'ERROR',
      message: 'Something broke',
      timestamp: '2026-03-22T10:00:00Z',
    };
    const blocks = formatCriticalError(error);
    expect(blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
  });
});
