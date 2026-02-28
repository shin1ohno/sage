/**
 * Slack Block Kit Formatters
 * Builds Slack Block Kit structures for meeting intelligence pipeline messages
 */

import type { SourceLinks, PipelineStatus, CriticalPipelineError } from '../types/pipeline-types.js';

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

const SLACK_BLOCK_LIMIT = 50;

function headerBlock(text: string): SlackBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

function sectionBlock(mrkdwn: string): SlackBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: mrkdwn },
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

  if (sourceLinks.notionUrls.length > 0) {
    const links = sourceLinks.notionUrls
      .map((url, i) => `<${url}|Notion page ${i + 1}>`)
      .join(' | ');
    elements.push({ type: 'mrkdwn', text: `📄 ${links}` });
  }

  if (sourceLinks.slackChannelUrls && sourceLinks.slackChannelUrls.length > 0) {
    const links = sourceLinks.slackChannelUrls
      .map((url, i) => `<${url}|Channel ${i + 1}>`)
      .join(' | ');
    elements.push({ type: 'mrkdwn', text: `💬 ${links}` });
  }

  if (sourceLinks.transcriptUrl) {
    elements.push({ type: 'mrkdwn', text: `🎙️ <${sourceLinks.transcriptUrl}|Transcript>` });
  }

  return elements;
}

function enforceBlockLimit(blocks: SlackBlock[]): SlackBlock[] {
  if (blocks.length <= SLACK_BLOCK_LIMIT) return blocks;

  // Preserve header (first) and context (last) blocks, truncate middle sections
  const header = blocks[0];
  const contextBlocks = blocks.filter((b) => b.type === 'context');
  const lastContext = contextBlocks.length > 0 ? contextBlocks[contextBlocks.length - 1] : null;

  const remaining = SLACK_BLOCK_LIMIT - 1 - (lastContext ? 1 : 0);
  const middle = blocks.slice(1, lastContext ? -contextBlocks.length : undefined);
  const truncated = middle.slice(0, remaining);

  const result = [header, ...truncated];
  if (lastContext) {
    result.push(lastContext);
  }
  return result;
}

function formatMessageBlocks(
  emoji: string,
  title: string,
  time: string,
  content: string,
  sourceLinks: SourceLinks,
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    headerBlock(`${emoji} ${title} — ${time}`),
    sectionBlock(content),
  ];

  const sourceElements = buildSourceElements(sourceLinks);
  if (sourceElements.length > 0) {
    blocks.push(contextBlock(sourceElements));
  }

  return enforceBlockLimit(blocks);
}

/**
 * Formats a pre-meeting briefing as Slack blocks
 */
export function formatBriefing(
  title: string,
  time: string,
  content: string,
  sourceLinks: SourceLinks,
): SlackBlock[] {
  return formatMessageBlocks('📋', title, time, content, sourceLinks);
}

/**
 * Formats a post-meeting report as Slack blocks (includes transcript link)
 */
export function formatPostMeetingReport(
  title: string,
  time: string,
  content: string,
  sourceLinks: SourceLinks,
): SlackBlock[] {
  return formatMessageBlocks('📝', title, time, content, sourceLinks);
}

/**
 * Formats a daily pipeline summary as Slack blocks
 */
export function formatDailySummary(status: PipelineStatus): SlackBlock[] {
  const lines = [
    `*Briefings sent:* ${status.briefingsSentToday}`,
    `*Post-meeting processed:* ${status.postMeetingProcessedToday}`,
    `*Action items created:* ${status.actionItemsCreatedToday}`,
    `*Errors:* ${status.errorsToday}`,
    `*Pending polls:* ${status.pendingPostMeetingPolls}`,
    `*Pipeline running:* ${status.isRunning ? 'Yes' : 'No'}`,
  ];

  return [
    headerBlock('📊 Daily Pipeline Summary'),
    sectionBlock(lines.join('\n')),
  ];
}

/**
 * Formats a critical pipeline error as Slack blocks
 */
export function formatCriticalError(error: CriticalPipelineError): SlackBlock[] {
  const blocks: SlackBlock[] = [
    headerBlock('⚠️ Pipeline Error'),
    sectionBlock(
      `*Type:* ${error.type}\n*Message:* ${error.message}\n*Time:* ${error.timestamp}`,
    ),
  ];

  if (error.details) {
    blocks.push(sectionBlock(`*Details:*\n${error.details}`));
  }

  return blocks;
}
