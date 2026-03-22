/**
 * PromptTemplateManager Unit Tests
 */

import { PromptTemplateManager } from '../../src/services/prompt-templates.js';
import type { PromptName } from '../../src/services/prompt-templates.js';

// Mock node:fs to control readFileSync behavior
jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
}));

import { readFileSync } from 'node:fs';

const mockedReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

describe('PromptTemplateManager', () => {
  let manager: PromptTemplateManager;

  beforeEach(() => {
    manager = new PromptTemplateManager('/tmp/test-prompts');
    mockedReadFileSync.mockReset();
  });

  it('returns default prompt when no override file exists', () => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    const result = manager.getPrompt('channel_discovery', { title: 'Standup', participants: 'Alice, Bob' });
    expect(result).toContain('Standup');
    expect(result).toContain('Alice, Bob');
  });

  it('substitutes variables correctly', () => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    const result = manager.getPrompt('briefing_generate', {
      title: 'Sprint Review',
      time: '14:00',
      participants: 'Team',
      slack_summary: 'Recent discussion...',
      notion_content: 'Doc content',
      agenda: 'Review items',
    });
    expect(result).toContain('Sprint Review');
    expect(result).toContain('14:00');
    expect(result).toContain('Recent discussion...');
  });

  it('replaces undefined variables with empty string', () => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    const result = manager.getPrompt('channel_discovery', {});
    expect(result).not.toContain('{{title}}');
    expect(result).not.toContain('{{participants}}');
  });

  it('uses override file when it exists', () => {
    mockedReadFileSync.mockReturnValue('Custom prompt for {{title}}');

    const result = manager.getPrompt('channel_discovery', { title: 'My Meeting' });
    expect(result).toBe('Custom prompt for My Meeting');
    expect(mockedReadFileSync).toHaveBeenCalledWith(
      '/tmp/test-prompts/channel_discovery.md',
      'utf-8',
    );
  });

  it('falls back to default when override file does not exist', () => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    const result = manager.getPrompt('briefing_generate', { title: 'Test' });
    expect(result).toContain('Test');
    expect(result.length).toBeGreaterThan(0);
  });

  it('has default prompts for all 8 PromptName values', () => {
    mockedReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    const names: PromptName[] = [
      'channel_discovery',
      'slack_summarize_batch',
      'slack_summarize_aggregate',
      'notion_search',
      'briefing_generate',
      'post_meeting_extract',
      'action_item_dedup',
      'assignee_resolve',
    ];

    for (const name of names) {
      const result = manager.getPrompt(name, {});
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('reloadTemplates does not throw', () => {
    expect(() => manager.reloadTemplates()).not.toThrow();
  });
});
