/**
 * Slack Block Kit Formatter
 * Pure functions that produce Slack Block Kit blocks for pipeline messages.
 */

import type { SourceLinks, PipelineStatus, CriticalPipelineError } from '../types/pipeline-types.js';

const MAX_BLOCKS = 50;

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

function headerBlock(text: string): SlackBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: text.slice(0, 150),
      emoji: true,
    },
  };
}

function sectionBlock(mrkdwn: string): SlackBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: mrkdwn.slice(0, 3000),
    },
  };
}

function contextBlock(elements: Array<{ type: string; text: string }>): SlackBlock {
  return {
    type: 'context',
    elements,
  };
}

function buildSourceElements(sourceLinks: SourceLinks): Array<{ type: string; text: string }> {
  const elements: Array<{ type: string; text: string }> = [];

  for (const url of sourceLinks.notionUrls) {
    elements.push({ type: 'mrkdwn', text: `<${url}|Notion>` });
  }

  for (const channel of sourceLinks.slackChannels) {
    elements.push({ type: 'mrkdwn', text: `<#${channel}>` });
  }

  if (sourceLinks.transcriptUrl) {
    elements.push({ type: 'mrkdwn', text: `<${sourceLinks.transcriptUrl}|Transcript>` });
  }

  return elements;
}

function splitContentIntoSections(content: string, maxSections: number): SlackBlock[] {
  if (!content) {
    return [];
  }

  // Split by double newline into paragraphs, each becoming a section block
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim());
  const sections: SlackBlock[] = [];

  for (const paragraph of paragraphs) {
    if (sections.length >= maxSections) {
      break;
    }
    sections.push(sectionBlock(paragraph));
  }

  if (sections.length === 0) {
    sections.push(sectionBlock(content));
  }

  return sections;
}

function truncateBlocks(blocks: SlackBlock[]): SlackBlock[] {
  if (blocks.length <= MAX_BLOCKS) {
    return blocks;
  }
  return blocks.slice(0, MAX_BLOCKS);
}

/**
 * Format a pre-meeting briefing into Slack blocks.
 */
export function formatBriefing(
  title: string,
  time: string,
  content: string,
  sourceLinks: SourceLinks,
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(headerBlock(`${title} - ${time}`));

  // Reserve 2 blocks for header + context
  const maxContentSections = MAX_BLOCKS - 2;
  const contentBlocks = splitContentIntoSections(content, maxContentSections);
  blocks.push(...contentBlocks);

  const sourceElements = buildSourceElements(sourceLinks);
  if (sourceElements.length > 0) {
    blocks.push(contextBlock(sourceElements));
  }

  return truncateBlocks(blocks);
}

/**
 * Format a post-meeting report into Slack blocks.
 */
export function formatPostMeetingReport(
  title: string,
  time: string,
  content: string,
  sourceLinks: SourceLinks,
): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(headerBlock(`${title} - ${time}`));

  // Reserve 2 blocks for header + context
  const maxContentSections = MAX_BLOCKS - 2;
  const contentBlocks = splitContentIntoSections(content, maxContentSections);
  blocks.push(...contentBlocks);

  const sourceElements = buildSourceElements(sourceLinks);
  if (sourceElements.length > 0) {
    blocks.push(contextBlock(sourceElements));
  }

  return truncateBlocks(blocks);
}

/**
 * Format a daily pipeline summary into Slack blocks.
 */
export function formatDailySummary(status: PipelineStatus): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(headerBlock('\ud83d\udcca Daily Pipeline Summary'));

  const metrics = [
    `*Briefings sent:* ${status.briefingsSentToday}`,
    `*Post-meeting processed:* ${status.postMeetingProcessedToday}`,
    `*Action items created:* ${status.actionItemsCreatedToday}`,
    `*Errors:* ${status.errorsToday}`,
    `*Pending post-meeting polls:* ${status.pendingPostMeetingPolls}`,
  ].join('\n');

  blocks.push(sectionBlock(metrics));

  return blocks;
}

/**
 * Format a critical pipeline error into Slack blocks.
 */
export function formatCriticalError(error: CriticalPipelineError): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push(headerBlock('\u26a0\ufe0f Pipeline Error'));

  const errorInfo = [
    `*Type:* ${error.type}`,
    `*Message:* ${error.message}`,
    `*Timestamp:* ${error.timestamp}`,
  ].join('\n');

  blocks.push(sectionBlock(errorInfo));

  if (error.details) {
    blocks.push(sectionBlock(`*Details:*\n${error.details}`));
  }

  return truncateBlocks(blocks);
}
