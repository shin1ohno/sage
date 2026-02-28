/**
 * Prompt Template Manager
 * Manages default and user-override prompt templates for the meeting intelligence pipeline
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type PromptName =
  | 'channel_discovery'
  | 'slack_summarize_batch'
  | 'slack_summarize_aggregate'
  | 'notion_search'
  | 'briefing_generate'
  | 'post_meeting_extract'
  | 'action_item_dedup';

const DEFAULT_PROMPTS: ReadonlyMap<PromptName, string> = new Map<PromptName, string>([
  [
    'channel_discovery',
    `You are identifying Slack channels relevant to a meeting.

Meeting title: {{title}}
Attendees: {{attendees}}
Available channels: {{channels}}

Return a JSON array of channel IDs most likely to contain relevant context for this meeting. Consider channel names, topics, and attendee membership. Limit to the top 5 most relevant channels.`,
  ],
  [
    'slack_summarize_batch',
    `Summarize the following Slack messages from channel #{{channel_name}}.

Messages:
{{messages}}

Provide a concise summary focusing on:
- Key decisions made
- Action items mentioned
- Topics discussed that relate to: {{meeting_title}}

Keep the summary under 200 words.`,
  ],
  [
    'slack_summarize_aggregate',
    `You have summaries from multiple Slack channels related to the meeting "{{meeting_title}}".

Channel summaries:
{{channel_summaries}}

Create a single unified summary that:
- Merges overlapping information
- Highlights the most important points
- Organizes by topic rather than by channel
- Stays under 300 words`,
  ],
  [
    'notion_search',
    `Given the meeting "{{meeting_title}}" with attendees {{attendees}}, identify search queries to find relevant Notion pages.

Return a JSON array of 2-3 search query strings that would find meeting notes, project documents, or related materials in Notion.`,
  ],
  [
    'briefing_generate',
    `Generate a pre-meeting briefing for "{{meeting_title}}" starting at {{start_time}}.

Attendees: {{attendees}}
Agenda: {{agenda}}

Slack context:
{{slack_summary}}

Notion documents:
{{notion_summary}}

Previous action items:
{{action_items}}

Create a concise briefing that includes:
1. Meeting purpose and agenda overview
2. Key context from recent discussions
3. Outstanding action items from previous meetings
4. Suggested talking points

Format using Slack mrkdwn syntax. Keep under 500 words.`,
  ],
  [
    'post_meeting_extract',
    `Extract structured information from the following meeting content for "{{meeting_title}}".

Sources:
{{sources}}

Extract:
1. A concise meeting summary (under 200 words)
2. Action items with assignees and due dates
3. Key decisions made
4. Follow-up items

For action items, return a JSON array with objects containing:
- description: string
- assignee: string (name of person responsible)
- dueDate: string (ISO date, estimate if not explicit)

Detect the source language and include it in your response as "sourceLanguage".`,
  ],
  [
    'action_item_dedup',
    `Compare the following action items and identify duplicates.

New items:
{{new_items}}

Existing items:
{{existing_items}}

Return a JSON object with:
- unique: array of new items that are genuinely new
- duplicates: array of objects with {newItem, existingItem} pairs that are duplicates or near-duplicates

Consider items as duplicates if they describe the same task even with different wording.`,
  ],
]);

function expandHome(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

export class PromptTemplateManager {
  private readonly promptsDir: string;

  constructor(promptsDir: string) {
    this.promptsDir = expandHome(promptsDir);
  }

  /**
   * Loads a prompt by name, checking for user overrides on disk first
   */
  getPrompt(name: PromptName, variables: Record<string, string>): string {
    let template = this.loadOverride(name) ?? this.loadDefault(name);
    for (const [key, value] of Object.entries(variables)) {
      template = template.replaceAll(`{{${key}}}`, value);
    }
    return template;
  }

  private loadOverride(name: PromptName): string | null {
    const filePath = join(this.promptsDir, `${name}.md`);
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  private loadDefault(name: PromptName): string {
    const template = DEFAULT_PROMPTS.get(name);
    if (!template) {
      throw new Error(`No default prompt template for "${name}"`);
    }
    return template;
  }
}
