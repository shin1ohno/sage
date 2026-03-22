/**
 * Prompt Template Manager
 * Manages LLM prompt templates with file-based overrides and variable substitution.
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
  | 'action_item_dedup'
  | 'assignee_resolve';

const DEFAULT_PROMPTS: Record<PromptName, string> = {
  channel_discovery: `Given a meeting titled "{{title}}" with participants {{participants}}, identify the most relevant Slack channels that may contain context for this meeting.

Return a JSON array of channel names (without #), ranked by relevance.
Consider: project channels, team channels, and topic-specific channels.`,

  slack_summarize_batch: `Summarize the following batch of Slack messages from channel #{{channel}}.
Focus on: decisions made, action items mentioned, and key discussion points relevant to the meeting "{{title}}".

Messages:
{{messages}}`,

  slack_summarize_aggregate: `You have multiple Slack channel summaries related to the meeting "{{title}}".
Combine them into a single coherent summary, removing duplicates and organizing by topic.

Summaries:
{{summaries}}`,

  notion_search: `Given the meeting "{{title}}" with the following context:
{{context}}

Suggest search queries to find relevant Notion documents. Return a JSON array of search query strings.`,

  briefing_generate: `Generate a pre-meeting briefing for "{{title}}" scheduled at {{time}}.

Participants: {{participants}}

Slack context:
{{slack_summary}}

Notion documents:
{{notion_content}}

Agenda:
{{agenda}}

Write a concise briefing covering: key context, relevant recent discussions, open action items, and suggested talking points.`,

  post_meeting_extract: `Analyze the following meeting transcript for "{{title}}" held at {{time}}.

Transcript:
{{transcript}}

Pre-meeting context:
{{briefing}}

Extract:
1. A concise meeting summary (3-5 bullet points)
2. Action items with assignees (format: "- [ ] Action item (@assignee)")
3. Key decisions made
4. Follow-up topics for next meeting`,

  action_item_dedup: `Compare the following new action items against existing ones and identify duplicates.

New action items:
{{new_items}}

Existing action items:
{{existing_items}}

For each new item, indicate if it is a duplicate (and which existing item it matches) or genuinely new.
Return a JSON array with { item, isDuplicate, matchedExistingItem? } for each.`,

  assignee_resolve: `Resolve the following assignee references to their actual identities.

Assignees mentioned: {{assignees}}

Known team members:
{{team_members}}

For each assignee, return a JSON object mapping the mentioned name to { email, slackUserId } if a match is found, or null if unresolved.`,
};

function resolvePath(dir: string): string {
  if (dir.startsWith('~')) {
    return join(homedir(), dir.slice(1));
  }
  return dir;
}

export class PromptTemplateManager {
  private readonly promptsDir: string;

  constructor(promptsDir?: string) {
    this.promptsDir = resolvePath(promptsDir ?? '~/.sage/prompts/');
  }

  /**
   * Get a prompt by name, applying variable substitution.
   * Override files in promptsDir take precedence over defaults.
   */
  getPrompt(name: PromptName, variables: Record<string, string>): string {
    let template: string;

    try {
      const filePath = join(this.promptsDir, `${name}.md`);
      template = readFileSync(filePath, 'utf-8');
    } catch {
      template = DEFAULT_PROMPTS[name];
    }

    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
  }

  /**
   * Reload templates from disk. Currently a no-op; reserved for future caching.
   */
  reloadTemplates(): void {
    // No-op: templates are read on each getPrompt call.
    // Reserved for future caching implementation.
  }
}
