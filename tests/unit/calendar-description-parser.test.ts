/**
 * Tests for calendar-description-parser utility functions
 */

import {
  extractNotionUrls,
  extractAgenda,
  extractMeetLink,
} from '../../src/utils/calendar-description-parser.js';

describe('extractNotionUrls', () => {
  it('should extract Notion URLs from HTML input', () => {
    const html = `
      <p>Meeting notes:</p>
      <a href="https://www.notion.so/workspace/page-abc123">Notes</a>
      <a href="https://example.com/other">Other</a>
    `;
    const result = extractNotionUrls(html);
    expect(result).toEqual(['https://www.notion.so/workspace/page-abc123']);
  });

  it('should extract Notion URLs from plain text input', () => {
    const text = 'See https://www.notion.so/workspace/page-abc123 for details';
    const result = extractNotionUrls(text);
    expect(result).toEqual(['https://www.notion.so/workspace/page-abc123']);
  });

  it('should exclude non-Notion URLs', () => {
    const text = 'Visit https://example.com and https://google.com for info';
    const result = extractNotionUrls(text);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty string', () => {
    const result = extractNotionUrls('');
    expect(result).toEqual([]);
  });

  it('should deduplicate URLs', () => {
    const text =
      'Link: https://www.notion.so/page-1 and again https://www.notion.so/page-1';
    const result = extractNotionUrls(text);
    expect(result).toEqual(['https://www.notion.so/page-1']);
  });

  it('should handle notion.site domain', () => {
    const text = 'See https://myworkspace.notion.site/page-xyz for details';
    const result = extractNotionUrls(text);
    expect(result).toEqual(['https://myworkspace.notion.site/page-xyz']);
  });
});

describe('extractAgenda', () => {
  it('should extract agenda from HTML with "Agenda:" keyword', () => {
    const html = `<p>Agenda: Discuss roadmap<br>Review Q3 goals</p>`;
    const result = extractAgenda(html);
    expect(result).not.toBeNull();
    expect(result).toContain('Discuss roadmap');
    expect(result).toContain('Review Q3 goals');
  });

  it('should extract agenda from plain text with "Agenda:" keyword', () => {
    const text = 'Agenda:\nItem 1\nItem 2';
    const result = extractAgenda(text);
    expect(result).not.toBeNull();
    expect(result).toContain('Item 1');
    expect(result).toContain('Item 2');
  });

  it('should return null when no agenda section exists', () => {
    const text = 'Just a regular meeting description without any agenda';
    const result = extractAgenda(text);
    expect(result).toBeNull();
  });

  it('should handle Japanese keywords (議題, アジェンダ)', () => {
    const text1 = '議題:\n予算の確認\nスケジュールの調整';
    const result1 = extractAgenda(text1);
    expect(result1).not.toBeNull();
    expect(result1).toContain('予算の確認');

    const text2 = 'アジェンダ:\nプロジェクト進捗\n次のステップ';
    const result2 = extractAgenda(text2);
    expect(result2).not.toBeNull();
    expect(result2).toContain('プロジェクト進捗');
  });
});

describe('extractMeetLink', () => {
  it('should extract Meet link from HTML href', () => {
    const html = '<a href="https://meet.google.com/abc-defg-hij">Join Meet</a>';
    const result = extractMeetLink(html);
    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('should extract Meet link from plain text', () => {
    const text = 'Join at https://meet.google.com/abc-defg-hij';
    const result = extractMeetLink(text);
    expect(result).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('should return null when no Meet link exists', () => {
    const text = 'Meeting in the conference room, no video call';
    const result = extractMeetLink(text);
    expect(result).toBeNull();
  });
});

describe('robustness', () => {
  it('should not crash on malformed HTML', () => {
    const malformed = '<p>Unclosed <a href="https://notion.so/page">link<div>broken</p>';
    expect(() => extractNotionUrls(malformed)).not.toThrow();
    expect(() => extractAgenda(malformed)).not.toThrow();
    expect(() => extractMeetLink(malformed)).not.toThrow();
  });
});
