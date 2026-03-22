/**
 * CalendarDescriptionParser Unit Tests
 */

import {
  extractNotionUrls,
  extractAgenda,
  extractMeetLink,
} from '../../src/utils/calendar-description-parser.js';

describe('extractNotionUrls', () => {
  it('extracts Notion URLs from HTML input', () => {
    const html = '<a href="https://www.notion.so/page-abc123">Meeting Notes</a>';
    const result = extractNotionUrls(html);
    expect(result).toEqual(['https://www.notion.so/page-abc123']);
  });

  it('extracts Notion URLs from plain text input', () => {
    const text = 'Check https://www.notion.so/page-abc123 for details';
    const result = extractNotionUrls(text);
    expect(result).toEqual(['https://www.notion.so/page-abc123']);
  });

  it('filters out non-Notion URLs', () => {
    const html = `
      <a href="https://www.notion.so/page-abc">Notion</a>
      <a href="https://google.com">Google</a>
      <a href="https://github.com/repo">GitHub</a>
    `;
    const result = extractNotionUrls(html);
    expect(result).toEqual(['https://www.notion.so/page-abc']);
  });

  it('returns empty array for empty string', () => {
    expect(extractNotionUrls('')).toEqual([]);
  });

  it('deduplicates URLs', () => {
    const html = `
      <a href="https://www.notion.so/page-abc">Link 1</a>
      <a href="https://www.notion.so/page-abc">Link 2</a>
    `;
    const result = extractNotionUrls(html);
    expect(result).toEqual(['https://www.notion.so/page-abc']);
  });

  it('supports notion.site domain', () => {
    const text = 'See https://myteam.notion.site/doc-123 for info';
    const result = extractNotionUrls(text);
    expect(result).toEqual(['https://myteam.notion.site/doc-123']);
  });
});

describe('extractAgenda', () => {
  it('extracts agenda from HTML', () => {
    const html = '<p>Some intro</p><p>Agenda:</p><p>Item 1</p><p>Item 2</p>';
    const result = extractAgenda(html);
    expect(result).toContain('Item 1');
    expect(result).toContain('Item 2');
  });

  it('extracts agenda from plain text', () => {
    const text = 'Meeting info\nAgenda:\n- Discuss roadmap\n- Review PRs';
    const result = extractAgenda(text);
    expect(result).toContain('Discuss roadmap');
    expect(result).toContain('Review PRs');
  });

  it('returns null when no agenda section is found', () => {
    const text = 'Just a regular meeting description without agenda';
    expect(extractAgenda(text)).toBeNull();
  });

  it('supports Japanese keywords (議題)', () => {
    const text = 'ミーティング情報\n議題:\n- ロードマップの議論';
    const result = extractAgenda(text);
    expect(result).toContain('ロードマップの議論');
  });

  it('supports Japanese keywords (アジェンダ)', () => {
    const text = 'ミーティング情報\nアジェンダ:\n- 進捗確認';
    const result = extractAgenda(text);
    expect(result).toContain('進捗確認');
  });
});

describe('extractMeetLink', () => {
  it('extracts Meet link from HTML', () => {
    const html = '<a href="https://meet.google.com/abc-defg-hij">Join Meeting</a>';
    const result = extractMeetLink(html);
    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('extracts Meet link from plain text', () => {
    const text = 'Join at https://meet.google.com/abc-defg-hij';
    const result = extractMeetLink(text);
    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('returns null when no Meet link is found', () => {
    const text = 'No video call for this meeting';
    expect(extractMeetLink(text)).toBeNull();
  });
});

describe('error handling', () => {
  it('does not crash on malformed HTML', () => {
    const badHtml = '<div><a href="broken<>link">text</a></div><p unclosed';
    expect(() => extractNotionUrls(badHtml)).not.toThrow();
    expect(() => extractAgenda(badHtml)).not.toThrow();
    expect(() => extractMeetLink(badHtml)).not.toThrow();
  });
});
