/**
 * Tests for slack-blocks utility functions
 */

import {
  formatBriefing,
  formatPostMeetingReport,
  formatDailySummary,
  formatCriticalError,
} from '../../src/utils/slack-blocks.js';
import type { SlackBlock } from '../../src/utils/slack-blocks.js';
import type {
  SourceLinks,
  PipelineStatus,
  CriticalPipelineError,
} from '../../src/types/pipeline-types.js';

describe('formatBriefing', () => {
  const baseSourceLinks: SourceLinks = {
    notionUrls: ['https://www.notion.so/page-1'],
  };

  it('should generate header + section + context blocks', () => {
    const blocks = formatBriefing('Standup', '09:00', 'Briefing content', baseSourceLinks);
    const types = blocks.map((b) => b.type);
    expect(types).toContain('header');
    expect(types).toContain('section');
    expect(types).toContain('context');
  });

  it('should include Notion URL mrkdwn links in context', () => {
    const blocks = formatBriefing('Standup', '09:00', 'Content', baseSourceLinks);
    const contextBlock = blocks.find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const elements = contextBlock!.elements as Array<{ type: string; text: string }>;
    const notionElement = elements.find((el) => el.text.includes('notion.so'));
    expect(notionElement).toBeDefined();
    expect(notionElement!.type).toBe('mrkdwn');
  });

  it('should work with empty sourceLinks', () => {
    const emptyLinks: SourceLinks = { notionUrls: [] };
    const blocks = formatBriefing('Standup', '09:00', 'Content', emptyLinks);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    // Should not have a context block when no source links
    const contextBlock = blocks.find((b) => b.type === 'context');
    expect(contextBlock).toBeUndefined();
  });
});

describe('formatPostMeetingReport', () => {
  it('should include transcriptUrl link when present', () => {
    const sourceLinks: SourceLinks = {
      notionUrls: [],
      transcriptUrl: 'https://example.com/transcript',
    };
    const blocks = formatPostMeetingReport('Review', '10:00', 'Summary', sourceLinks);
    const contextBlock = blocks.find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const elements = contextBlock!.elements as Array<{ type: string; text: string }>;
    const transcriptElement = elements.find((el) => el.text.includes('Transcript'));
    expect(transcriptElement).toBeDefined();
    expect(transcriptElement!.text).toContain('https://example.com/transcript');
  });
});

describe('formatDailySummary', () => {
  it('should generate blocks with all metrics', () => {
    const status: PipelineStatus = {
      isRunning: true,
      briefingsSentToday: 5,
      postMeetingProcessedToday: 3,
      actionItemsCreatedToday: 12,
      errorsToday: 1,
      pendingPostMeetingPolls: 2,
    };
    const blocks = formatDailySummary(status);
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const sectionBlock = blocks.find((b) => b.type === 'section');
    expect(sectionBlock).toBeDefined();
    const text = sectionBlock!.text!.text;
    expect(text).toContain('5');
    expect(text).toContain('3');
    expect(text).toContain('12');
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('Yes');
  });
});

describe('formatCriticalError', () => {
  it('should generate error blocks with type, message, timestamp', () => {
    const error: CriticalPipelineError = {
      type: 'auth_failure',
      message: 'Token expired',
      timestamp: '2026-02-28T10:00:00Z',
    };
    const blocks = formatCriticalError(error);
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const sectionBlock = blocks.find((b) => b.type === 'section');
    expect(sectionBlock).toBeDefined();
    const text = sectionBlock!.text!.text;
    expect(text).toContain('auth_failure');
    expect(text).toContain('Token expired');
    expect(text).toContain('2026-02-28T10:00:00Z');
  });

  it('should include details section when details are present', () => {
    const error: CriticalPipelineError = {
      type: 'api_error',
      message: 'Rate limit exceeded',
      timestamp: '2026-02-28T11:00:00Z',
      details: 'Retry after 60 seconds',
    };
    const blocks = formatCriticalError(error);
    const sectionBlocks = blocks.filter((b) => b.type === 'section');
    expect(sectionBlocks.length).toBeGreaterThanOrEqual(2);

    const detailsBlock = sectionBlocks.find(
      (b) => b.text!.text.includes('Retry after 60 seconds'),
    );
    expect(detailsBlock).toBeDefined();
  });
});

describe('all functions', () => {
  it('should output 50 blocks or fewer', () => {
    const sourceLinks: SourceLinks = { notionUrls: ['https://www.notion.so/p1'] };
    const status: PipelineStatus = {
      isRunning: false,
      briefingsSentToday: 0,
      postMeetingProcessedToday: 0,
      actionItemsCreatedToday: 0,
      errorsToday: 0,
      pendingPostMeetingPolls: 0,
    };
    const error: CriticalPipelineError = {
      type: 'test',
      message: 'test',
      timestamp: 'now',
    };

    expect(formatBriefing('T', '09:00', 'C', sourceLinks).length).toBeLessThanOrEqual(50);
    expect(formatPostMeetingReport('T', '09:00', 'C', sourceLinks).length).toBeLessThanOrEqual(50);
    expect(formatDailySummary(status).length).toBeLessThanOrEqual(50);
    expect(formatCriticalError(error).length).toBeLessThanOrEqual(50);
  });
});

describe('long content', () => {
  it('should truncate to stay under 50 blocks', () => {
    // Build content that would produce many section blocks if each paragraph were separate
    // In practice, formatBriefing puts content into a single section, so we test the
    // enforceBlockLimit mechanism by verifying the output stays within bounds even with
    // extremely long content that could theoretically expand.
    const longContent = Array.from({ length: 200 }, (_, i) => `Point ${i + 1}: details`).join('\n');
    const sourceLinks: SourceLinks = {
      notionUrls: Array.from({ length: 10 }, (_, i) => `https://www.notion.so/page-${i}`),
    };
    const blocks = formatBriefing('Long Meeting', '09:00', longContent, sourceLinks);
    expect(blocks.length).toBeLessThanOrEqual(50);
  });
});
